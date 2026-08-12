import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  KAYKIT_SHIELD_ACCESSORIES,
  KAYKIT_SHIELD_GRIPS,
} from '../src/render/characters/held_item_grips';
import {
  itemOffhandModelUrl,
  itemWeaponModelUrl,
  manifestUrls,
  mechHeldWeaponOverride,
  offhandModelUrl,
  VISUALS,
  weaponSkinModelUrl,
  weaponSkinModelUrls,
} from '../src/render/characters/manifest';
import { WEAPON_SKIN_LIST } from '../src/sim/content/weapon_skins';
import { ITEMS } from '../src/sim/data';
import { weaponHand } from '../src/sim/equipment_rules';
import { ITEM_WEAPON_VARIANTS } from '../src/ui/weapon_variants';

// The per-item held weapon models: each weapon item maps (via the shared
// ITEM_WEAPON_VARIANTS table) to a variant key that must have BOTH a 3D model GLB
// (held in-hand) and a 2D icon JPG (bag), so the held weapon always matches its
// inventory icon.
describe('held weapon models', () => {
  it('every weapon variant has a model GLB and an icon JPG on disk', () => {
    const keys = [...new Set(Object.values(ITEM_WEAPON_VARIANTS))];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(existsSync(`public/models/weapons/${key}.glb`), `${key}.glb missing`).toBe(true);
      expect(existsSync(`public/ui/weapons/${key}.jpg`), `${key}.jpg missing`).toBe(true);
    }
  });

  it('itemWeaponModelUrl resolves mapped items and ignores everything else', () => {
    expect(itemWeaponModelUrl('worn_sword')).toBe('models/weapons/sword_a.glb');
    expect(itemWeaponModelUrl('fen_reaver_glaive')).toBe('models/weapons/scythe.glb');
    expect(itemWeaponModelUrl('eastbrook_greatsword')).toBe('models/weapons/adv_sword_2handed.glb');
    expect(itemWeaponModelUrl('highwatch_greatsword')).toBe('models/weapons/adv_sword_2handed.glb');
    expect(itemWeaponModelUrl('deathless_greatblade')).toBe(
      'models/weapons/adv_sword_2handed_color.glb',
    );
    expect(itemWeaponModelUrl('heroic_wyrmfang_greatblade')).toBe(
      'models/weapons/adv_sword_2handed_color.glb',
    );
    expect(itemWeaponModelUrl('chest_armor_not_a_weapon')).toBeNull();
    expect(itemWeaponModelUrl(null)).toBeNull();
    expect(itemWeaponModelUrl(undefined)).toBeNull();
  });

  // COVERAGE: every equippable weapon must map to a held model. An unmapped item
  // falls back asymmetrically in assets.ts: swapAttachDef keeps the class DEFAULT
  // mainhand model (renders the wrong weapon) while offhandAttachDef returns null
  // and attachAllProps silently skips the hand (renders nothing), so dual-wielding
  // two copies of an unmapped one-hander showed only the mainhand.
  it('every weapon item resolves a mainhand held model', () => {
    const weapons = Object.values(ITEMS).filter((item) => item.kind === 'weapon');
    expect(weapons.length).toBeGreaterThan(0);
    const unmapped = weapons.filter((item) => itemWeaponModelUrl(item.id) === null);
    expect(unmapped.map((item) => item.id)).toEqual([]);
  });

  // Anything that can sit in the offhand slot (a one-hander for a dual wielder, a
  // fury two-hander, a shield) must resolve there too, or the hand renders empty.
  // The held_offhand kind (caster orbs/tomes) is swept by the pin test below.
  it('every offhand-capable weapon and shield resolves an offhand held model', () => {
    const offhandCapable = Object.values(ITEMS).filter(
      (item) =>
        (item.kind === 'weapon' && weaponHand(item) !== 'mainhand') ||
        (item.kind === 'armor' && item.slot === 'offhand' && item.shield === true),
    );
    expect(offhandCapable.length).toBeGreaterThan(0);
    const unmapped = offhandCapable.filter((item) => itemOffhandModelUrl(item.id) === null);
    expect(unmapped.map((item) => item.id)).toEqual([]);
  });

  // The wraithfire_orb (and its generated heroic clone) plus the valefire_lantern
  // are the known held model gaps: the shared art set has no orb or lantern model
  // to map them to, so they need new art, not a table row. Pinning the exact set
  // makes the exception conscious: a future held_offhand item must either map to
  // a model or extend this pin.
  it('pins the held_offhand items without a model (orb and lantern)', () => {
    const heldOffhands = Object.values(ITEMS).filter((item) => item.kind === 'held_offhand');
    const unmapped = heldOffhands
      .filter((item) => itemOffhandModelUrl(item.id) === null)
      .map((item) => item.id)
      .sort();
    expect(unmapped).toEqual(['heroic_wraithfire_orb', 'valefire_lantern', 'wraithfire_orb']);
  });

  it('resolves actual offhands independently from the mainhand model', () => {
    expect(itemOffhandModelUrl('eastbrook_buckler')).toBe('models/weapons/shield_round.glb');
    expect(itemOffhandModelUrl('highwatch_wallshield')).toBe('models/weapons/shield_square.glb');
    expect(itemOffhandModelUrl('rusty_dagger')).toBe('models/weapons/dagger_a.glb');
    expect(itemOffhandModelUrl('heroic_fang_of_korzul')).toBe('models/weapons/dagger_c.glb');
    expect(itemOffhandModelUrl('chest_armor_not_an_offhand')).toBeNull();
    expect(itemOffhandModelUrl(null)).toBeNull();
    expect(itemOffhandModelUrl(undefined)).toBeNull();
  });

  it('preloads every live shield model used by an actual offhand', () => {
    const manifest = new Set(manifestUrls());
    for (const url of [
      itemOffhandModelUrl('eastbrook_buckler'),
      itemOffhandModelUrl('highwatch_wallshield'),
    ]) {
      expect(url).not.toBeNull();
      if (!url) continue;
      expect(existsSync(`public/${url}`), `${url} missing`).toBe(true);
      expect(manifest.has(url), `${url} missing from manifestUrls()`).toBe(true);
    }
  });

  it('uses KayKit authored per-variant shield seats in both hands', () => {
    const seats = [
      [
        'shield_round',
        'Round_Shield',
        {
          position: [0, 0.017, 0.1771],
          scale: 0.4413,
        },
      ],
      [
        'shield_square',
        'Rectangle_Shield',
        {
          position: [0, 0.017, 0.1617],
          scale: 0.5964,
        },
      ],
      [
        'shield_badge',
        'Badge_Shield',
        {
          position: [0, -0.0123, 0.1341],
          scale: 0.5108,
        },
      ],
    ] as const;

    for (const [file, node, grip] of seats) {
      expect(KAYKIT_SHIELD_ACCESSORIES[file]).toBe(node);
      expect(KAYKIT_SHIELD_GRIPS[node]).toEqual({
        r: { ...grip, quaternion: [0, 1, 0, 0] },
        l: { ...grip, quaternion: [0, 0, 0, 1] },
      });
    }
    expect(KAYKIT_SHIELD_GRIPS).not.toHaveProperty('Shield');
  });

  // Every weapon variant must belong to a family that has a hand-grip mapping in
  // src/render/characters/assets.ts (KAYKIT_WEAPON_ACCESSORY). Without one the
  // model would attach at the bone origin untransformed. This list MUST stay in
  // sync with the variant families gripped there; a new family (e.g. a spear) needs
  // both a grip entry and an addition here, or this fails loudly.
  it('every weapon variant belongs to a grip-mapped family', () => {
    // Each variant key must contain a known weapon-type token so it maps to a grip
    // family in KAYKIT_WEAPON_ACCESSORY (assets.ts). Covers both the bare variant
    // keys (sword_a) and the prefixed/extra models (adv_sword_1handed, spear_a).
    const TYPES = [
      'sword',
      'dagger',
      'staff',
      'hammer',
      'axe',
      'mace',
      'halberd',
      'spear',
      'scythe',
      'wand',
      'bow',
    ];
    for (const key of new Set(Object.values(ITEM_WEAPON_VARIANTS))) {
      const ok = TYPES.some((t) => key.includes(t));
      expect(ok, `${key} has no recognized weapon type (needs a grip mapping)`).toBe(true);
    }
  });

  // Every player class swaps its held mainhand to the equipped weapon, EXCEPT the
  // hunter, which keeps its crossbow regardless of the melee weapon equipped. The
  // cosmetic Combat Mech (player_mech) is class-agnostic but is included: it still
  // shows the wearer's equipped mainhand, like every other body.
  // The kawaii class bodies model their weapon into the mesh (the fast baked
  // path), so they carry no live weapon attach/swap. The Combat Mech is the one
  // non-baked cosmetic body left, so it alone still swaps its mainhand.
  it('the kawaii player classes bake their weapons; only the Combat Mech still swaps', () => {
    const players = Object.keys(VISUALS).filter((k) => k.startsWith('player_'));
    expect(players).toContain('player_hunter');
    expect(players).toContain('player_mech');
    for (const key of players) {
      const def = VISUALS[key];
      if (key === 'player_mech') {
        expect(def.weaponSlots, 'the mech still swaps its mainhand').toEqual([0]);
      } else {
        expect(def.weaponSlots, `${key} bakes its weapon (no swap)`).toBeUndefined();
        expect(def.attach, `${key} has no live attach`).toBeUndefined();
        expect(def.offhandSlot, `${key} has no live offhand`).toBeUndefined();
      }
    }
  });

  it('the Combat Mech keeps a plain mainhand swap with the sword as its no-weapon default', () => {
    expect(VISUALS.player_mech.weaponSlots).toEqual([0]);
    expect(VISUALS.player_mech.offhandSlot).toBeUndefined();
    expect(VISUALS.player_mech.attach).toEqual([
      { url: 'models/weapons/sword_1handed.glb', bone: 'handslot.r' },
    ]);
  });

  // With the kawaii classes baked, no class exposes a weapon layout, so the mech
  // has nothing per-class to mirror: mechHeldWeaponOverride is null for every
  // class and the mech falls back to its own default mainhand. (Restoring the
  // mech's per-class offhand mirroring would need a layout table decoupled from
  // the now-baked class VISUALS.)
  it('the Combat Mech no longer mirrors a per-class offhand (classes are baked)', () => {
    for (const cls of [
      'warrior',
      'rogue',
      'paladin',
      'shaman',
      'hunter',
      'priest',
      'mage',
      'warlock',
      'druid',
    ] as const) {
      expect(mechHeldWeaponOverride(cls), `${cls} has no live layout to mirror`).toBeNull();
    }
  });
});

// Season 1 Armory weapon skins swap the held model exactly like per-item
// variants, so every skin GLB must resolve by skin id and ride the boot preload
// sweep: any nearby player can have any skin applied, and the attach path is
// synchronous (resolvedGltf throws on an un-preloaded url).
describe('weapon skin held models', () => {
  it('weaponSkinModelUrl resolves catalog skins and ignores everything else', () => {
    expect(weaponSkinModelUrl('ice_fang_sword')).toBe('models/weapons/ice_fang.glb');
    expect(weaponSkinModelUrl('not_a_skin')).toBeNull();
    expect(weaponSkinModelUrl(null)).toBeNull();
    expect(weaponSkinModelUrl(undefined)).toBeNull();
  });

  // The offhand slot mirrors the active skin ONLY onto a matching-type weapon;
  // everything else keeps its own item model. This is the render half of
  // the pure offhandMirrorsWeaponSkin rule (its full truth table is in
  // tests/weapon_skins.test.ts).
  it('offhandModelUrl mirrors the skin onto a matching-type offhand weapon', () => {
    // Dagger skin + offhand dagger: the offhand renders the SKIN model.
    expect(offhandModelUrl('rusty_dagger', 'frostbite_dagger')).toBe(
      weaponSkinModelUrl('frostbite_dagger'),
    );
    expect(offhandModelUrl('heroic_fang_of_korzul', 'ashspark_dagger')).toBe(
      weaponSkinModelUrl('ashspark_dagger'),
    );
    // Sword skin + offhand one-hand sword: also mirrors.
    expect(offhandModelUrl('crossroads_saber', 'ice_fang_sword')).toBe(
      weaponSkinModelUrl('ice_fang_sword'),
    );
  });

  it('offhandModelUrl keeps the item model for a non-matching offhand', () => {
    // Different-type weapon, shield, and held offhand all fall back to the item.
    expect(offhandModelUrl('crossroads_saber', 'frostbite_dagger')).toBe(
      itemOffhandModelUrl('crossroads_saber'),
    );
    expect(offhandModelUrl('eastbrook_buckler', 'frostbite_dagger')).toBe(
      itemOffhandModelUrl('eastbrook_buckler'),
    );
    // No skin at all: unchanged item resolution (the common case).
    expect(offhandModelUrl('rusty_dagger', null)).toBe(itemOffhandModelUrl('rusty_dagger'));
    expect(offhandModelUrl('eastbrook_buckler', null)).toBe(
      itemOffhandModelUrl('eastbrook_buckler'),
    );
    expect(offhandModelUrl(null, 'frostbite_dagger')).toBeNull();
  });

  it('ships 29 distinct skin model urls, all in the boot preload manifest', () => {
    const urls = weaponSkinModelUrls();
    expect(urls.length).toBe(WEAPON_SKIN_LIST.length);
    expect(urls.length).toBe(29);
    expect(new Set(urls).size).toBe(29);
    const manifest = new Set(manifestUrls());
    for (const url of urls) {
      expect(url.startsWith('models/weapons/'), url).toBe(true);
      expect(manifest.has(url), `${url} missing from manifestUrls()`).toBe(true);
    }
  });
});
