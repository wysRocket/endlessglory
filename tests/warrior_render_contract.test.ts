import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import {
  attackAbilityId,
  isSpinAttackAbility,
  weaponAttackStyle,
} from '../src/render/characters/weapon_attack_style_core';
import { WARRIOR_SHOUT_COLORS, warriorCastVisualPlan } from '../src/render/warrior_cast_fx_core';
import { ABILITIES } from '../src/sim/data';

/**
 * Clip names straight out of a GLB's JSON chunk. A GLB is a 12-byte header then
 * length(4) + type(4) + data chunks, and animation names live in the JSON one, so
 * this needs no glTF library and no buffer or meshopt decoding.
 */
function glbClipNames(path: string): string[] {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not a GLB: ${path}`);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  return (gltf.animations ?? []).map((a: { name?: string }) => a.name ?? '');
}

describe('winning Warrior attack animation routing', () => {
  it('selects a swing from the actual live hands, including Titan Grip', () => {
    expect(weaponAttackStyle('worn_sword', null)).toBeNull();
    expect(weaponAttackStyle('wyrmfang_greatblade', null)).toBe('twohand');
    expect(weaponAttackStyle('worn_sword', 'rusty_dagger')).toBe('dualwield');
    expect(weaponAttackStyle('wyrmfang_greatblade', 'deathless_greatblade')).toBe('dualwield');
    expect(weaponAttackStyle('missing_item', 'rusty_dagger')).toBeNull();
  });

  it('drives the kawaii Warrior from clips baked into its own body GLB', () => {
    const def = VISUALS.player_warrior;
    // Fast-path kawaii body: gear is modeled in, so no attach / gear-driven swap.
    expect(def.url).toBe('models/kawaii/warrior.glb');
    expect(def.attach).toBeUndefined();
    expect(def.weaponSlots).toBeUndefined();
    // Unlike its roster siblings the warrior does NOT graft the shared donors: its
    // bind pose diverges from the shared skeleton, so the donors (which store
    // absolute local rotations) would replay distorted. It carries its own
    // retargeted copies instead, which is why there are no animUrls.
    expect(def.animUrls).toBeUndefined();
    // The single generic 'attack' swing plays for every ability (no per-ability map).
    expect(def.clips.attack).toEqual(['attack']);
    expect(def.clips.attackByAbility).toBeUndefined();
    // With no donors, the body GLB is the ONLY clip source: if it stops carrying
    // these three, the warrior silently loses its animation and nothing else fails.
    const baked = glbClipNames(`public/${def.url}`);
    for (const name of [def.clips.idle, def.clips.walk, ...def.clips.attack]) {
      expect(baked, `${name} missing from ${def.url}`).toContain(name);
    }
  });

  it('normalizes damage-event display names and preserves the whirlwind spin cue', () => {
    expect(attackAbilityId(ABILITIES.mortal_strike.name)).toBe('mortal_strike');
    expect(attackAbilityId(ABILITIES.whirlwind.name)).toBe('whirlwind');
    expect(attackAbilityId('mortal_strike')).toBe('mortal_strike');
    expect(attackAbilityId('missing ability')).toBeUndefined();
    expect(isSpinAttackAbility('whirlwind')).toBe(true);
    expect(isSpinAttackAbility('mortal_strike')).toBe(false);
  });
});

describe('winning Warrior cast VFX routing', () => {
  it('keeps the authored per-shout colors and one-pump roar plan', () => {
    expect(WARRIOR_SHOUT_COLORS).toEqual({
      battle_shout: 0xff2a1a,
      demoralizing_shout: 0x9a5df0,
      emboldening_roar: 0xff5470,
      defiant_bellow: 0xff8c2a,
      rallying_cry: 0xffe9a0,
      intimidating_shout: 0x7f8ad0,
    });
    expect(warriorCastVisualPlan('shout', 'rallying_cry')).toEqual({
      kind: 'shout',
      color: 0xffe9a0,
      ringRadius: 8,
      emote: 'cheer',
      repeats: 1,
    });
  });

  it('routes weapon aura and defensive flourish to authored clips only', () => {
    expect(warriorCastVisualPlan('weaponAura', 'sanguine_aura')).toEqual({
      kind: 'gesture',
      abilityId: 'sanguine_aura',
    });
    expect(warriorCastVisualPlan('flourish', 'raised_guard')).toEqual({
      kind: 'gesture',
      abilityId: 'raised_guard',
    });
    expect(warriorCastVisualPlan('projectile', 'heroic_throw')).toBeNull();
  });
});
