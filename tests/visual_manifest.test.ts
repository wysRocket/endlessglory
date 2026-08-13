import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import {
  type ClipMap,
  manifestUrls,
  manifestUrlsForGraphics,
  SKINS,
  VISUALS,
  visibleAttachmentsForGraphics,
  visualKeyFor,
} from '../src/render/characters/manifest';
import { NPCS } from '../src/sim/data';

function expectedClipNames(clips: ClipMap): string[] {
  return [
    clips.idle,
    clips.walk,
    clips.run,
    clips.death,
    clips.cast,
    clips.sitDown,
    clips.sitIdle,
    clips.swim,
    clips.jump,
    clips.walkBack,
    clips.flourish,
    ...clips.attack,
    ...(clips.hit ?? []),
    ...Object.values(clips.emote ?? {}).flatMap((spec) => spec.clips),
  ].filter((name): name is string => !!name);
}

async function glbAnimationNames(path: string): Promise<Set<string>> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path);
  return new Set(
    doc
      .getRoot()
      .listAnimations()
      .map((animation) => animation.getName()),
  );
}

describe('character visual manifest', () => {
  it('keeps Bursar Fernando in his likeness atlas (the Eastbrook banker easter egg)', () => {
    // The maintainer-approved easter egg: black shoulder-length hair and light
    // brown skin ride a repainted rogue palette resolved at skin index 0 (NPCs
    // always resolve skin 0; the mech precedent for a real index-0 texture).
    // The def must stay TINT-FREE: an entity tint would wash the repaint back
    // toward the gold villager look. Do not "clean up" any of the three.
    const key = visualKeyFor({ kind: 'npc', templateId: 'bursar_fernando' } as never);
    expect(key).toBe('npc_fernando');
    expect(VISUALS.npc_fernando.tint).toBeUndefined();
    const atlas = SKINS.npc_fernando?.[0];
    expect(atlas).toBe('textures/skins/rogue/fernando.png');
    expect(existsSync(fileURLToPath(new URL(`../public/${atlas}`, import.meta.url)))).toBe(true);
  });

  it('resolves all three Chroniclers to the shared scholarly-mage visual', () => {
    // One def, three tints: the per-NPC NpcDef color carries each identity,
    // so the def must keep tint 'entity', and the three colors must stay
    // pairwise distinct and off the bursar gold and auctioneer amethyst.
    for (const templateId of [
      'chronicler_saul',
      'chronicler_osric_fenn',
      'chronicler_edda_hartwell',
    ]) {
      expect(visualKeyFor({ kind: 'npc', templateId } as never)).toBe('npc_chronicler');
    }
    const visual = VISUALS.npc_chronicler;
    expect(visual.url).toBe('models/chars/players/mage.glb');
    expect(visual.show).toEqual(['Mage_Hat']);
    expect(visual.tint).toBe('entity');
    expect(visual.attach?.map((a) => a.url)).toEqual([
      'models/weapons/staff.glb',
      'models/weapons/spellbook_open.glb',
    ]);
    expect(visual.attach?.[1]?.gripRef).toBe('Spellbook_open');

    expect(NPCS.chronicler_saul.color).toBe(0xd08a2e);
    expect(NPCS.chronicler_osric_fenn.color).toBe(0x3fa66b);
    expect(NPCS.chronicler_edda_hartwell.color).toBe(0x5a6fd6);
    const reserved = [NPCS.bursar_petra_vell.color, 0xc9a227, 0x8e5ad6];
    for (const id of [
      'chronicler_saul',
      'chronicler_osric_fenn',
      'chronicler_edda_hartwell',
    ] as const) {
      expect(reserved).not.toContain(NPCS[id].color);
    }
    // The Thornpeak chronicler's display name is renamed to Zenzie while the
    // template id stays (save compatibility); pin the English so a revert
    // cannot land silently.
    expect(NPCS.chronicler_edda_hartwell.name).toBe('Chronicler Zenzie');
  });

  it('uses the custom boar death clip without relying on a speed override', () => {
    expect(VISUALS.mob_boar.clips.death).toBe('Dying');
    expect(VISUALS.mob_boar.deathTimeScale).toBeUndefined();
  });

  it('renders the Nythraxis phase-2 court as Aldren / Malric / Voss, not generic skeletons', () => {
    // The heroic "Spirit of X" adds are the same characters risen again, so they
    // must reuse each named crypt boss's visual. Without the MOB_KEYS entries they
    // fall through to FAMILY_KEYS.undead (skel_minion) and the court renders as
    // three identical grunts. Each add is pinned to its counterpart's key.
    const court: Array<[string, string]> = [
      ['nythraxis_heroic_warrior_add', 'fallen_captain_aldren'],
      ['nythraxis_heroic_priest_add', 'corrupted_priest_malric'],
      ['nythraxis_heroic_rogue_add', 'deathstalker_voss'],
    ];
    for (const [addId, namedId] of court) {
      const addKey = visualKeyFor({ kind: 'mob', templateId: addId } as never);
      const namedKey = visualKeyFor({ kind: 'mob', templateId: namedId } as never);
      expect(addKey, addId).toBe(namedKey);
      expect(addKey, addId).not.toBe('skel_minion');
    }
  });

  it('gives the summoned Water Elemental its own untinted animated water body', async () => {
    const key = visualKeyFor({ kind: 'mob', templateId: 'water_elemental' } as never);
    expect(key).toBe('mob_water_elemental');

    const visual = VISUALS[key];
    expect(visual.url).toBe('models/creatures/water_elemental.glb');
    expect(visual.tint).toBeUndefined();
    expect(visual.clips.cast).toBe('Channel');
    expect(visual.clips.attack).toEqual(['Cast']);

    const animationNames = await glbAnimationNames(`public/${visual.url}`);
    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('points the Combat Mech manifest at animation clips baked into the GLB', async () => {
    const visual = VISUALS.player_mech;
    const animationNames = await glbAnimationNames(`public/${visual.url}`);

    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('points the Stone Cantor manifest at clips present in the GLB (including the synthesized Hit)', async () => {
    const visual = VISUALS.mob_reedbound_acolyte;
    const animationNames = await glbAnimationNames(`public/${visual.url}`);

    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('points the training dummy manifest at clips present in the GLB, with cast/jump deliberately absent', async () => {
    const visual = VISUALS.mob_training_dummy;
    const animationNames = await glbAnimationNames(`public/${visual.url}`);

    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
    expect(visual.clips.cast).toBeUndefined();
    expect(visual.clips.jump).toBeUndefined();
    expect(animationNames.has('Cast')).toBe(false);
    expect(animationNames.has('Jump')).toBe(false);
  });

  it('points the baked wolf visuals (form_cat, mob_wolf, greyjaw) at clips in their GLBs', async () => {
    const byUrl = new Map<string, Set<string>>();
    for (const key of ['form_cat', 'mob_wolf', 'greyjaw'] as const) {
      const visual = VISUALS[key];
      const animationNames =
        byUrl.get(visual.url) ?? (await glbAnimationNames(`public/${visual.url}`));
      byUrl.set(visual.url, animationNames);

      expect(animationNames.size).toBeGreaterThan(0);
      expect(
        [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
      ).toEqual([]);
    }
  });

  it('keeps held weapons and props available on low graphics', () => {
    const allWeaponUrls = manifestUrls().filter((url) => url.startsWith('models/weapons/'));
    expect(allWeaponUrls.length).toBeGreaterThan(0);
    expect(manifestUrlsForGraphics(false)).toEqual(expect.arrayContaining(allWeaponUrls));
    // npc_knight carries the attached one-handed sword (KayKit handslot rig).
    expect(visibleAttachmentsForGraphics(VISUALS.npc_knight).map((a) => a.url)).toContain(
      'models/weapons/sword_1handed.glb',
    );
    // EVERY kawaii class models a weapon/focus into its own hand, so arming one would
    // double up in the same hand. The warrior was the one exception until its body was
    // re-rigged through Meshy auto-rigging: the replacement mesh carries its own blades,
    // so the live attach came off. Guards against a stray attach clash.
    const CLEAN = [
      'warrior',
      'paladin',
      'hunter',
      'rogue',
      'priest',
      'shaman',
      'mage',
      'warlock',
      'druid',
    ] as const;
    for (const cls of CLEAN) {
      expect(VISUALS[`player_${cls}`].attach, `${cls} is not double-armed`).toBeUndefined();
    }
  });

  it('gives the roster-variety templates their own bodies instead of an over-used one', () => {
    // Seven templates that each shared a body with many other mobs now wear a GLB
    // that was already committed and licensed but unused. Pinned by template id
    // AND by asset url: a revert to the shared body has to fail here.
    const wired: Array<[templateId: string, key: string, url: string]> = [
      ['deepfen_murloc', 'mob_snapper', 'models/creatures/crabenemy.glb'],
      ['bog_bloat', 'mob_bog_bloat', 'models/creatures/glubevolved.glb'],
      ['grubjaw', 'mob_grubjaw', 'models/creatures/orcenemy.glb'],
      ['sump_troll_devourer', 'mob_devourer', 'models/creatures/yeti.glb'],
      ['wyrmcult_zealot', 'mob_zealot', 'models/creatures/tribal.glb'],
      ['vale_bandit', 'mob_bandit_archer', 'models/chars/players/ranger.glb'],
      ['knight_commander_olen', 'mob_knight_commander', 'models/chars/players/paladin.glb'],
    ];
    // The bodies they came off are still shared by other mobs, so none of the
    // seven may quietly land back on one of them.
    const vacated = [
      'models/creatures/frog.glb',
      'models/creatures/orc.glb',
      'models/creatures/yetialt.glb',
      'models/chars/players/rogue_hooded.glb',
      'models/chars/enemies/skeleton_warrior.glb',
    ];
    for (const [templateId, key, url] of wired) {
      expect(visualKeyFor({ kind: 'mob', templateId } as never), templateId).toBe(key);
      expect(VISUALS[key].url, key).toBe(url);
      expect(vacated, `${templateId} is back on a shared body`).not.toContain(VISUALS[key].url);
    }
  });

  it('points every roster-variety visual at clip names its own GLB really has', async () => {
    // Clip vocabularies differ per source pack and there is no automatic
    // retarget, so a wrong ClipMap factory ships a mob frozen in its bind pose
    // with no runtime error. crabenemy/orcenemy/yeti in particular look like the
    // ENEMY7 rig (same 'HitRecieve' misspelling) but ship no Run clip at all.
    for (const key of [
      'mob_snapper',
      'mob_bog_bloat',
      'mob_grubjaw',
      'mob_devourer',
      'mob_zealot',
      'mob_bandit_archer',
      'mob_knight_commander',
    ] as const) {
      const visual = VISUALS[key];
      const animationNames = await glbAnimationNames(`public/${visual.url}`);
      expect(animationNames.size, key).toBeGreaterThan(0);
      expect(
        [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
        `${key} names clips absent from ${visual.url}`,
      ).toEqual([]);
    }
    // The BITER pack ships no Run take: run MUST alias Walk rather than being
    // left to a silent fallback, which is the exact trap that factory documents.
    const yetiClips = await glbAnimationNames('public/models/creatures/yeti.glb');
    expect(yetiClips.has('Run')).toBe(false);
    expect(VISUALS.mob_devourer.clips.run).toBe('Walk');
  });

  it('hovers the two roster-variety bodies whose rigs have no legs', () => {
    // glubevolved and tribal are authored as flying meshes (wings / no leg
    // joints) and carry the FLOATING clip set. Without a hover offset they
    // render sunk into the ground with a walk cycle that never plays.
    for (const key of ['mob_bog_bloat', 'mob_zealot'] as const) {
      expect(VISUALS[key].hover ?? 0, key).toBeGreaterThan(0);
      expect(VISUALS[key].clips.idle, key).toBe('Flying_Idle');
    }
  });

  it('keeps deepfen_spearjaw on its raptor model despite its reptile family retag', () => {
    // Prose-only claim otherwise (FAMILY_KEYS.reptile comment): the explicit MOB_KEYS
    // override this pins is what actually keeps the model, and nothing else does.
    expect(visualKeyFor({ kind: 'mob', templateId: 'deepfen_spearjaw' } as never)).toBe(
      'mob_spearjaw',
    );
  });
});
