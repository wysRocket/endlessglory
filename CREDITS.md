# Asset Credits

Most bundled third-party art assets are CC0 (public domain dedication). The
exceptions are the three.js water normal maps (MIT), the guide webfonts (SIL
OFL 1.1), the CraftPix skill-icon packs, and the paid KayKit character packs
that every player model and four skeleton enemies are built from. The CraftPix
icon packs were **purchased by the Levy Street account (callum@levystreet.com)**
and are used under the CraftPix premium royalty-free license. Attribution is
provided as a courtesy.

Some shipped models have provenance that could not be established from this
repository, and two of them are open compliance questions rather than paperwork.
They are recorded under **Unresolved provenance** below rather than assigned a
license, and should be settled before the next commercial release.

| Assets | Author | Source | License |
|---|---|---|---|
| Emberwood Eastbrook buildings and props (`emberwood/eastbrook/*.glb`) | Quaternius | Re-exports of the Quaternius village and props packs credited below, not original work: `eastbrook/house_c.glb` still carries the pack mesh name `House_4` and is vertex-identical to `props/house_3.glb`. The commit that shipped them (`2c029be8d`) calls them "model placeholders (copied CC0)" | CC0 1.0 |
| Emberwood foliage (`emberwood/foliage/*.glb`) | Quaternius | Re-exports of the Stylized Nature MegaKit credited below; `foliage/oak_1.glb` carries node `CommonTree_1` and is vertex-identical to `foliage/oak_1.glb` | CC0 1.0 |
| Emberwood weapons (`emberwood/weapons/{shield,staff,sword}.glb`) | Kay Lousberg (KayKit) | Re-exports of the CC0 Adventurers pack credited below; `sword.glb` root node is `sword_1handed`, material `knight_texture` | CC0 1.0 |
| Emberwood NPC visuals rethemed from KayKit bodies (`emberwood/npcs/emberwood_{barbarian,guard,knight,mage,npc_woman,paladin,priest,ranger,rogue}.glb`) | Kay Lousberg (KayKit) | Retextured from the paid Adventurers 2.0 pack by `scripts/retheme_openmmo_npc.py`; each carries the KayKit `Rig_Medium` armature | Paid pack, terms not recorded in-repo (see Unresolved provenance) |
| Character models + animations (`chars/players/mage_classic.glb`), weapons/shields | Kay Lousberg (KayKit) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | CC0 1.0 |
| Skeleton enemy models (`chars/enemies/{skeleton_mage,skeleton_minion}.glb`), bone weapons | Kay Lousberg (KayKit) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | CC0 1.0 |
| Skeleton enemy models (`chars/enemies/{necromancer,skeleton_golem,skeleton_rogue,skeleton_warrior}.glb`) | Kay Lousberg (KayKit) | KayKit Skeletons 1.1, per `scripts/assets/specs/skeletons_v2.json` | Paid pack, terms not recorded in-repo (see Unresolved provenance) |
| Kawaii player and NPC bodies (`kawaii/{druid,hunter,mage,mob_hallow,npc_armorer,npc_dealer,npc_foreman,npc_paladin,npc_smith,paladin,priest,rogue,shaman,warlock,warrior,warrior_attack,warrior_walk}.glb`) | World of ClaudeCraft | Project-generated via Meshy AI. `kawaii/warrior.glb` matches the Meshy signature documented at `scripts/_bake_meshy_scale.mjs` (Armature root at scale 0.01 over centimetre space) and the already-credited `creatures/yumi_cat.glb`; the other 16 are Meshy meshes re-rigged onto that skeleton by `scripts/rig_kawaii_char.py` | Meshy plan coverage unconfirmed for these files (see Unresolved provenance) |
| Dungeon modular kit (walls, floors, pillars, torches, banners, chests, furniture) | Kay Lousberg (KayKit) | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | CC0 1.0 |
| Graveyard/crypt props, dead trees, lanterns | Kay Lousberg (KayKit) | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 | CC0 1.0 |
| Extra character animation library (Rig_Medium), including the bow clip set (`chars/players/bow_anims.glb`) | Kay Lousberg (KayKit) | https://kaylousberg.itch.io/kaykit-character-animations | CC0 1.0 |
| Animated creatures (`creatures/{alpaca,bull,crabenemy,demon,demonalt,dragonevolved,fox,frog,ghost,giant,glubevolved,goblin,golelingevolved,orc,orcenemy,spider,stag,tribal,velociraptor,yeti,yetialt}.glb`) | Quaternius | https://poly.pizza/u/Quaternius · https://quaternius.com | CC0 1.0 |
| Procedurally authored creature models (`creatures/chicken_cow.glb`, `creatures/water_elemental.glb`) | World of ClaudeCraft | Authored in-repo by `scripts/gen_chicken_cow.mjs` and `scripts/gen_water_elemental.mjs`, which write these exact paths | Project asset |
| Ambient wildlife models (`creatures/{rabbit_critter,songbird_critter,squirrel_critter,leaping_fish}.glb`) | World of ClaudeCraft | Project-generated via Tripo AI 3D; each carries its own `tripo_mesh_` identifier | Project asset |
| Reedbound Acolyte body (`creatures/stone_cantor.glb`) | World of ClaudeCraft | Tripo AI 3D mesh (`tripo_mat_5397a323`); its `Hit` clip authored in-repo by `scripts/_add_cantor_hit_anim.mjs` | Project asset (mesh) |
| Stylized Nature MegaKit (trees, rocks, bushes, mushrooms, grass) | Quaternius | https://quaternius.itch.io/stylized-nature-megakit | CC0 1.0 |
| Medieval Village Pack (houses, inn, blacksmith, well, market, cart) | Quaternius | https://quaternius.com/packs/medievalvillage.html | CC0 1.0 |
| Fantasy Props MegaKit (barrels, crates, lanterns, furniture, smithy) | Quaternius | https://quaternius.itch.io/fantasy-props-megakit | CC0 1.0 |
| Nature Kit (modular cliffs), Graveyard Kit, Pirate Kit (docks/boats), Fantasy Town Kit, Castle Kit, Particle Pack (VFX sprites) | Kenney | https://kenney.nl | CC0 1.0 |
| Pirate Kit (palm trees, docks, ship, chests, cannon, anchor, beach rocks, beach house) | Quaternius | https://quaternius.com/packs/piratekit.html | CC0 1.0 |
| LowPoly Animated Fish (dolphin, shark, manta ray, whale, clownfish, blue tang, puffer, swordfish, anglerfish, koi) | Quaternius | https://poly.pizza/u/Quaternius | CC0 1.0 |
| Modular Dungeons Pack (stone walls, arches, pillar, floor tile, wall banner, trap door, horse statue, cobweb, coin piles) | Quaternius | https://poly.pizza/u/Quaternius | CC0 1.0 |
| Medieval Village MegaKit (wagon, crate, fences, vines, arch, exterior stairs) | Quaternius | https://quaternius.com/packs/medievalvillagemegakit.html | CC0 1.0 |
| Survival Kit (tents, bedrolls, campfires, signpost, sand rocks) | Kenney | https://kenney.nl/assets/survival-kit | CC0 1.0 |
| Watercraft Kit (sail boats, fishing boat, rowboat, buoys) | Kenney | https://kenney.nl/assets/watercraft-kit | CC0 1.0 |
| Modular Dungeon Kit (corridor and room tiles, stairs, gates) | Kenney | https://kenney.nl/assets/modular-dungeon-kit | CC0 1.0 |
| Mini Dungeon (trap, wood structure, supports, column, banner) | Kenney | https://kenney.nl/assets/mini-dungeon | CC0 1.0 |
| Medieval Hexagon Pack (hex buildings, hex tiles, walls, bridge) | Kay Lousberg (KayKit) | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 | CC0 1.0 |
| Canyon Terrain Asset (cacti, desert tree, canyon rock formations, boulders, mesas) | loafbrr | https://loafbrr.itch.io/canyon-terrain-asset | CC0 1.0 |
| Mines and Cave Modular Set (mine carts, rails, ladder, cave rocks, entrances, supports, platforms) | loafbrr | https://loafbrr.itch.io/mines-and-cave-set | CC0 1.0 |
| Terrain PBR textures (Grass001, Ground048, Rock051, Ground071, Ground080, PavingStones046, Snow010A) | ambientCG | https://ambientcg.com | CC0 1.0 |
| Terrain PBR textures, biome set (Ground054, Ground095A, Ground093A, Rock029, Lava004, Gravel024, Rock035) | ambientCG | https://ambientcg.com | CC0 1.0 |
| HDRI environment maps (kloofendal_48d_partly_cloudy_puresky, belfast_open_field, kiara_1_dawn, dikhololo_night) | Poly Haven | https://polyhaven.com | CC0 1.0 |
| Vale Cup practice-pitch skybox (env/space_galaxy.jpg, the 360 degree Milky Way panorama) | ESO / S. Brunier | https://www.eso.org/public/images/eso0932a/ | CC BY 4.0 |
| Water normal maps (waternormals.jpg, Water_1/2_M_Normal.jpg) | three.js authors | https://github.com/mrdoob/three.js (r165, examples/textures) | MIT |
| Biome backdrop panoramas (vale_backdrop.webp, marsh_backdrop.webp, peaks_backdrop.webp and 4K variants) | World of ClaudeCraft | Project-generated procedural painterly sky panorama art | Project asset |
| Elite dragon rank emblem (`public/ui/ranks/elite-dragon-frame.webp`) | World of ClaudeCraft | Project-generated with OpenAI image generation and optimized locally | Project asset |
| Meshy creature models (`creatures/{tolling_bell,spider_egg_sac}.glb` from the Drowned Litany, `creatures/yumi_cat.glb` from Protect Yumi) | World of ClaudeCraft | Project-generated via Meshy AI (text-to-3D; yumi_cat rigged and animated), owned under the Meshy paid-plan license | Project asset |
| Legacy Credits prototype weapon models and source images (emberfang, Red Skull, and Purple sets, in `public/models/weapons/` and `public/ui/weapons/`) | World of ClaudeCraft | Project-generated and normalized through the PR 1405 asset pipeline | Project asset |
| Bag icons (`public/ui/items/{backpack,linen_pouch,travelers_knapsack,wolfhide_satchel,gravewoven_bag,mistcallers_duffel}.webp`, encoded to 128px WebP via `scripts/convert_item_icons_webp.mjs`) | World of ClaudeCraft | Project art created for this game; provenance per icon in `public/ui/items/mapping.json` | Project asset |
| Class ability icons (`public/ui/skills/<class>/*.webp`, re-encoded from the source-pack PNGs to WebP via `scripts/convert_skill_icons_webp.mjs`; all 9 classes: paladin, hunter, priest, warlock, rogue, warrior, mage, druid, shaman; source packs paladin/archer/priest/warlock/thief/warrior/berserker/demon/druid/pyromancer/cryomancer/aeromancer/lightning-mage/earth-magician/100-rpg-skill-icons/100-skill-icons-pack-for-rpg + per-ability fill sets) | CraftPix | https://craftpix.net | CraftPix premium (royalty-free commercial), purchased by Levy Street account (callum@levystreet.com) |
| Collective Reversal and Hourglass of Suspension ability icons (`public/ui/skills/mage/collective_reversal.webp`, `public/ui/skills/mage/temporal_hourglass.webp`) | World of ClaudeCraft project owner | Owner-provided original artwork | Project asset |
| Season 1 Armory weapon models, source images, generated store thumbnails, and promotional card (Guildmark, Emberwrought, Hoarfrost, and Fallen Star collections, in `public/models/weapons/`, `public/ui/weapons/`, and `public/ui/store/`) | World of ClaudeCraft | Project-generated via `scripts/asset_pipeline` (Tripo AI 3D); storefront renders composited locally, with the text-free promo background derived through OpenAI image editing | Project asset |
| Credits visual asset set (`public/credits/`: coin, UI icons, and denomination stacks; excludes the two payment-rail brand icons noted under Brand marks) | World of ClaudeCraft | Project-generated via the Higgsfield MCP connector (Recraft V4.1 stills), composited and web-optimized locally; owned under the Higgsfield paid-plan license | Project asset |
| Sampled interface and event sound effects (`public/audio/sfx/ui_*.mp3`, except `ui_level_up.mp3` and `ui_achievement.mp3`, credited under Audio below) | World of ClaudeCraft | Project-generated deterministic FFmpeg synthesis via `scripts/gen_ui_sfx.mjs` | Project asset |
| Book of Deeds achievement icons (`public/ui/deeds/*.webp`, one per earnable deed, downscaled from the maintainer's 512px source set to 128px WebP via `scripts/convert_deed_icons_webp.mjs`) | World of ClaudeCraft | Maintainer-commissioned bespoke art, owned by the project | Project asset |
| Guide webfonts (`public/fonts/*.woff2`: Cinzel by Natanael Gama; Alegreya and Alegreya Sans by Juan Pablo del Peral, Huerta Tipografica; woff2 subsets latin/latin-ext/cyrillic/vietnamese as served by Google Fonts, self-hosted for the /wiki guide) | Natanael Gama; Huerta Tipografica | https://fonts.google.com/specimen/Cinzel , https://fonts.google.com/specimen/Alegreya , https://fonts.google.com/specimen/Alegreya+Sans | SIL OFL 1.1 |
| Owner-provided Mage artwork (`fireball_form.webp`, `counterspell.webp`) | Levy Street account | Owner-provided artwork | Used with permission |
| Temporal clock sound effect (`public/audio/sfx/temporal_clock.mp3`) | World of ClaudeCraft | User-provided source recording | Project asset |
| KayKit Adventurers 2.0 + Character Animations 1.1 (player base models `public/models/chars/players/{knight,paladin,mage,druid,barbarian,rogue,rogue_hooded,ranger,mage_classic}.glb` and the merged animation library; source for the 9 Emberwood NPC visuals `public/models/emberwood/npcs/emberwood_{barbarian,guard,knight,mage,npc_woman,paladin,priest,ranger,rogue}.glb` via `scripts/retheme_openmmo_npc.py`) | Kay Lousberg (KayKit) | Paid pack, purchase account/date not recorded in the commit that added it (`2133845ed`) | KayKit premium license (purchased; terms not re-confirmed here, TODO owner to fill in) |
| Amber-Heart Golem base rig/mesh (`public/models/emberwood/creatures/amber_heart_golem.glb`, retextured to obsidian/amber in Blender) | Unverified | Provenance unclear: the commit that added it (`d42b5a05d`) claims an "OpenMMO orc base" but this could not be confirmed or ruled out from the repo alone (distinct Mixamo-style rig from the already-credited Quaternius `orc.glb` mob, but no direct evidence of the claimed source) | TODO owner to confirm actual source and license before relying on this credit |

## Loading art

| Assets | Author | Source | License |
|---|---|---|---|
| Loading / "entering the world" key art (`public/loading-screen.jpg`) | Endless Glory | Generated with Google Nano Banana, upscaled to 1536x1024 | Project asset |

## Unresolved provenance

These ship today but their attribution could not be established from anything in
this repository. They are listed here rather than given a plausible-looking
license row, because a confident wrong attribution is worse than a recorded gap.
`tests/credits_coverage.test.ts` requires every shipped model to appear either in
the tables above or in this section, so nothing goes missing silently again.

**Two of these are open compliance questions, not paperwork.** They are marked
BLOCKER and should be settled before the next commercial release.

| Asset | What the evidence shows | What would settle it |
|---|---|---|
| **BLOCKER.** The 7 variety Emberwood NPCs: `emberwood/npcs/emberwood_{armorer,dealer,fisherman,foreman,groundskeeper,herbalist,provisioner}.glb` | `scripts/retheme_openmmo_npc_variety.py` states the sources were "staged raw pulls from github.com/Julian-adv/OpenMMO". This repo's own `.claude/skills/woc-world-creatures/SKILL.md` records that OpenMMO is **PolyForm Noncommercial 1.0.0**, confirmed by fetching its LICENSE, and warns that anything from it "needs the owner's explicit permission before it ships". This game is commercial. The staged sources were gitignored and never committed, so the chain of title cannot be reconstructed here; `emberwood_dealer.glb` additionally carries a `tripo_mat_` identifier, which does not fit an OpenMMO origin. Three of the seven are dead in the manifest but still ship. | Either explicit permission from the OpenMMO owner, or removing these seven files and their manifest entries. A credits row does not resolve a license incompatibility. |
| **BLOCKER.** `chars/players/Mech/characters/CombatMech.glb` and its committed source `CombatMech.fbx` | The committed FBX embeds the artist's own export path identifying it as KayKit **Patreon** "Mystery Characters" Series 5, a different product from both the CC0 GitHub packs and the paid Adventurers 2.0 pack credited above. The **source FBX is itself published**: `src/render/assets/manifest.generated.ts` maps it into `/media/`, and `public/` deploys verbatim, so the pack file is redistributed to anyone who requests the URL. | The KayKit Patreon tier terms, specifically whether they permit redistributing the source asset. Removing the `.fbx` from the shipped media set is the smaller fix regardless. |
| `creatures/wolf_basic.glb`, `creatures/greyjaw.glb`, `emberwood/creatures/wolf.glb` | All three share one donor quadruped rig: identical 48-joint list and order, identical 14-clip set (`Bark`, `Howl`, `Idle Alert`, `Sneak`, `Sit`, `Fall`) found in no other model here and matching no Quaternius pack. Source comments call it a "Dog_Animation donor skeleton", but that string appears nowhere else in the tree: no file, no spec, no bake script. The Quaternius row above no longer claims them. | The author of `da24f4d83` confirming what the Dog_Animation donor was and under what license. |
| `creatures/wild_boar.glb` | Added as a Sketchfab export: the original blob in `72f4bc9a` contains the wrapper chain `Sketchfab_model` and `fb000749137341de99bac236bf0169ef.fbx` around `SWINECONE`. The shipped file still carries material `anim_Swinecone_01_PM_mat_Swinecone`; the wrapper was stripped by a later optimize pass, so provenance now exists only in history. No uploader or license was recorded. | Resolving Sketchfab model `fb000749137341de99bac236bf0169ef` to its uploader and license. |
| `chars/enemies/skeleton_dagger.glb` | Appears in neither `scripts/assets/specs/characters.json` nor `skeletons_v2.json`, so which KayKit skeleton pack it came from is not recorded. | Confirming which pack and version it was built from. |
| `kawaii/*.glb` (all 17) | The evidence that these are Meshy output is strong and they are credited as such above, but the commit that added them (`0f194199`) says in its own words that "Meshy asset licensing must be verified for this commercial game before shipping". The existing Meshy row asserts a paid-plan license for other creatures; whether the same plan covers these is an account-records question. | Confirming these 17 fall under the same Meshy paid plan already cited, and recording the account the way the CraftPix row does. |
| KayKit Adventurers 2.0, the KayKit Paladin pack, and KayKit Skeletons 1.1 | Commit `2133845ed` states these are "the paid KayKit Adventurers 2.0 + Character Animations 1.1 packs". Every player model and four skeleton enemies build from them. No license text or purchase account is recorded, unlike the CraftPix packs. | The purchasing account and pack terms, recorded here the way the CraftPix row does it. |

## Brand marks

The four streamer-platform marks inlined as SVG paths in `src/ui/ui_icons.ts`
(Twitch, X, Kick, YouTube) are the trademarks of their respective platforms,
reproduced monochrome and unmodified in shape solely to identify a link that
points at that platform. They are not project assets, and no endorsement or
affiliation is implied. The Discord (Clyde) mark in the same file is used the
same way.

The Solana and USDC logos shipped as `public/credits/icons/solana-icon.webp`
and `public/credits/icons/usdc-icon.webp` are trademarks of their respective
owners, reproduced unmodified solely to identify the corresponding payment
rail in the Credits buy window (`src/ui/credits_window.ts`). They are not
project assets, and no endorsement or affiliation is implied.

## Audio

All sampled sound effects credited to @jamiecypher below (`public/audio/sfx/`)
are original recordings and sound design, reworked using original sounds and
licensed source material from EastWest Composer Cloud, Epic Stock Media, and
Freesound.org (CC0). @jamiecypher retains copyright and publishes this work
under CC BY-NC 4.0 (Creative Commons Attribution-NonCommercial 4.0
International): free to use and share non-commercially with attribution.
@jamiecypher separately grants World of ClaudeCraft (Levy Street) a
perpetual, royalty-free license to use these assets commercially, including
in official releases and the Credits store.

| Assets | Author | Source | License |
|---|---|---|---|
| Quest event sounds (`quest_accept`, `quest_ready`, `quest_complete`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Lockpick minigame sounds (`lockpick_*`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Wand auto-attack sounds (`wand_*`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Level-up and Book of Deeds achievement chimes (`ui_level_up`, `ui_achievement`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Magic-school impact and casting-support one-shots (`impact_*`, `heal_impact`, `buff_apply`, `debuff_apply`, `spell_nova`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Magic-school projectile launches (`proj_*`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Melee, footstep, movement, combat-reaction, and player-state sounds (`melee_*`, `foot_*`, `move_*`, `combat_*`, `player_death*`, `player_hurt*`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Creature vocalizations, every mob family (`mob_*`) | @jamiecypher | Original work | CC BY-NC 4.0 (+ perpetual commercial grant to World of ClaudeCraft) |
| Generated prop model (marsh_plank_bridge) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (marsh_shrine_fragment) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (marsh_corpse_candle) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (marsh_bell_gallows) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (marsh_sluice_post) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (marsh_dead_tree) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (marsh_reed_cluster) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (yumi_brazier_stand) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (yumi_torch_handle) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (dungeon_door_arch) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (crypt_ritual_circle) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (delve_module_exit) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (delve_surface_exit) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (delve_rite_shrine_bell) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (delve_rite_shrine_candle) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (delve_rite_shrine_reed) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (delve_rite_shrine_skull) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (delve_pressure_plate) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (marsh_root_wall) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated creature model + animations (`creatures/training_dummy.glb`) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D, auto-rig + preset retargets) | Project asset |
| Generated prop model (engineering_workbench) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (alchemy_cauldron) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (cooking_spit) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (leatherworking_rack) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (tailoring_loom) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (inscription_lectern) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (enchanting_altar) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (jewelcrafting_bench) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (mining_ore_cart) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |
| Generated prop model (herbalism_drying_rack) | World of ClaudeCraft | Project-generated via scripts/asset_pipeline (Tripo AI 3D) | Project asset |

Assets were optimized for shipping (animation clip pruning, meshopt compression,
texture resizing) via `scripts/assets/build_assets.mjs`; raw packs are not
committed. License texts: https://creativecommons.org/publicdomain/zero/1.0/ ,
https://github.com/mrdoob/three.js/blob/r165/LICENSE , and
https://craftpix.net/file-licenses/ (CraftPix).
