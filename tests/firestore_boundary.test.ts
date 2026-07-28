// The Firestore scope boundary, enforced in code.
//
// Spec: docs/superpowers/specs/2026-07-27-firestore-scope-design.md. Firestore holds
// client-owned, non-authoritative PREFERENCES and nothing else. Postgres stays the
// sole source of truth for accounts, sessions, and every piece of game state, because
// the server is authoritative and a Firestore security rule cannot restore that: rules
// constrain shape, not legitimacy. A rule cannot know whether a player actually killed
// the mob.
//
// This suite is the guard that stops settings sync from quietly becoming a second
// source of truth later. It is deliberately hostile to additions: the syncable set is
// a CLOSED allowlist pinned literally here, so widening it in the client is a failing
// test rather than a silent architecture change.

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyRemotePrefs,
  collectLocalPrefs,
  FIRESTORE_PREF_KEYS,
  isSyncablePrefKey,
  prefsDocPath,
} from '../src/net/firestore_prefs';

// The exact set, spelled out rather than derived from the module under test: a pin
// that recomputes its own expectation from the source it is pinning proves nothing.
const EXPECTED_KEYS = [
  'woc_settings',
  'woc_keybinds',
  'woc_gamepad_bindings',
  'ev_music_on',
  'clock24h',
  'chatTimestamps',
  'chatClock',
  'minimapZoom',
];

// Vocabulary from the authoritative side. If any of these ever appears in a syncable
// key, someone has started moving game state into a store the client can write.
const GAME_STATE_VOCABULARY = [
  'gold',
  'money',
  'xp',
  'level',
  'inventory',
  'inv',
  'bag',
  'bank',
  'equip',
  'gear',
  'item',
  'quest',
  'talent',
  'deed',
  'renown',
  'market',
  'auction',
  'position',
  'pos',
  'zone',
  'character',
  'account',
  'token',
  'session',
  'realm',
  'arena',
  'rating',
  'guild',
  'trade',
  'mail',
  'loot',
  'spell',
  'ability',
  'cooldown',
  'health',
  'mana',
  'stat',
];

describe('Firestore scope boundary', () => {
  it('syncs exactly the pinned preference allowlist and nothing else', () => {
    expect([...FIRESTORE_PREF_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('carries no game-state vocabulary in any syncable key', () => {
    const offenders: string[] = [];
    for (const key of FIRESTORE_PREF_KEYS) {
      const normalized = key.toLowerCase();
      for (const word of GAME_STATE_VOCABULARY) {
        // Word-ish boundary: the key vocabulary is snake/camel, so a bare substring
        // match would flag 'clock24h' for 'clock'. Split on non-alphanumerics and
        // camel humps, then compare whole segments.
        const segments = normalized.split(/[^a-z0-9]+/).flatMap((s) => s.split(/(?<=\d)(?=[a-z])/));
        if (segments.includes(word)) offenders.push(`${key} contains "${word}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('rejects a key outside the allowlist even when it looks like a preference', () => {
    expect(isSyncablePrefKey('woc_settings')).toBe(true);
    expect(isSyncablePrefKey('woc_inventory')).toBe(false);
    expect(isSyncablePrefKey('woc_settings_v2')).toBe(false);
    expect(isSyncablePrefKey('')).toBe(false);
  });

  it('scopes every document under the signed-in uid', () => {
    expect(prefsDocPath('uid-abc')).toBe('users/uid-abc/prefs/client');
  });

  it('refuses to build a path without a uid, rather than writing to a shared doc', () => {
    expect(() => prefsDocPath('')).toThrow();
    expect(() => prefsDocPath('   ')).toThrow();
  });

  // The remote document is untrusted input: a rolled-back client, a console edit, or a
  // future version could put anything in it, and applying it verbatim would let a
  // Firestore document set arbitrary localStorage entries on every device that syncs.
  it('drops non-allowlisted and non-string keys coming back from the cloud', () => {
    const written: Record<string, string> = {};
    const storage = {
      setItem: (k: string, v: string) => {
        written[k] = v;
      },
    };
    const applied = applyRemotePrefs(
      {
        woc_settings: '{"sfxVolume":0.5}',
        woc_inventory: '["sword_of_cheating"]',
        __proto__: 'polluted',
        clock24h: '1',
        minimapZoom: 3,
      },
      storage,
    );
    expect(applied.sort()).toEqual(['clock24h', 'woc_settings']);
    expect(written).toEqual({ woc_settings: '{"sfxVolume":0.5}', clock24h: '1' });
  });

  it('collects only allowlisted keys that are actually present locally', () => {
    const local: Record<string, string> = {
      woc_settings: '{"sfxVolume":0.5}',
      woc_gold: '999999',
    };
    const collected = collectLocalPrefs({ getItem: (k: string) => local[k] ?? null });
    expect(collected).toEqual({ woc_settings: '{"sfxVolume":0.5}' });
  });

  // The sim is a fixed 20 Hz deterministic tick across three hosts. A sim module that
  // could read a network store would make its output depend on network state, which is
  // exactly what tests/parity/ exists to catch. Cheaper to forbid the import outright.
  it('is never imported by src/sim/ or server/', () => {
    const importers = importersOf('firestore_prefs');
    expect(importers.filter((f) => f.startsWith('src/sim/') || f.startsWith('server/'))).toEqual(
      [],
    );
  });

  // Without this, the two import guards below would pass just as happily if the
  // scanner were silently finding nothing at all.
  it('has a scanner that actually finds imports (non-vacuity check)', () => {
    expect(importersOf('firebase/firestore')).toContain('src/net/firestore_sync.ts');
    expect(importersOf('firestore_prefs')).toContain('src/net/firestore_sync.ts');
  });

  // The server must not depend on Firestore for anything, so that an unavailable or
  // compromised Firestore cannot influence a game outcome.
  it('keeps the firebase/firestore SDK out of server/ and src/sim/ entirely', () => {
    const importers = importersOf('firebase/firestore');
    expect(importers.filter((f) => f.startsWith('src/sim/') || f.startsWith('server/'))).toEqual(
      [],
    );
  });
});

/** Every .ts file under a root, walked from DISK rather than from git: an untracked
 *  new module is exactly the case this guard has to catch, and `git ls-files` would
 *  skip it silently. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Every source file under src/ and server/ whose text imports the given specifier. */
function importersOf(specifier: string): string[] {
  const files = [...sourceFiles('src'), ...sourceFiles('server')];
  return files.filter((file) =>
    new RegExp(`from\\s+['"][^'"]*${specifier}['"]`).test(readFileSync(file, 'utf8')),
  );
}
