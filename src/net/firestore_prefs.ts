// Cross-device sync for client-owned preferences, backed by Firestore.
//
// Scope spec: docs/superpowers/specs/2026-07-27-firestore-scope-design.md. The short
// version, because getting it wrong is an architecture break rather than a bug:
//
//   Firestore holds PREFERENCES. Postgres holds everything else, always.
//
// The server is authoritative: clients stream intent and the server's Sim decides every
// outcome. Firestore's whole proposition is a client writing straight to a cloud
// database, which is exactly what that forbids for anything a player could gain from.
// Security rules cannot rescue it either, since they constrain the SHAPE of a write and
// not its legitimacy: no rule can know whether the player actually killed the mob. So
// nothing here touches game state, not as a cache, not as a mirror, not "just for
// reads", and src/sim/ never learns this module exists (a sim that read a network store
// would make its 20 Hz tick depend on network state and break determinism).
//
// What this buys: settings are per-browser today and lost on a device change. A player
// who edits their own keybinds in the Firestore console has achieved nothing, which is
// what makes the sync safe.
//
// Failure behavior is local and boring. Firestore unreachable means the client keeps
// using localStorage, where these settings already live; nothing blocks login or play.
// Two devices racing means last write wins per document. These are preferences, there
// is no correctness claim to preserve.
//
// The boundary is enforced by tests/firestore_boundary.test.ts, which pins the
// allowlist literally and fails on any game-state vocabulary appearing in it.

/**
 * The CLOSED allowlist of localStorage keys that sync. Adding to this is a deliberate
 * act with a failing test attached: widen it only for data that belongs to the human
 * rather than the character, that confers no advantage if edited, and that src/sim/
 * never reads.
 */
export const FIRESTORE_PREF_KEYS: readonly string[] = Object.freeze([
  // Esc options: camera, audio volumes, graphics tier, control preferences.
  'woc_settings',
  // Keyboard and gamepad bindings.
  'woc_keybinds',
  'woc_gamepad_bindings',
  // Music on/off toggle.
  'ev_music_on',
  // HUD chrome preferences.
  'clock24h',
  'chatTimestamps',
  'chatClock',
  'minimapZoom',
]);

const PREF_KEY_SET = new Set(FIRESTORE_PREF_KEYS);

/** Exact allowlist membership. Deliberately not a prefix or pattern match: a rule like
 *  "anything starting with woc_" would silently admit whatever a future feature stores
 *  under that prefix. */
export function isSyncablePrefKey(key: string): boolean {
  return PREF_KEY_SET.has(key);
}

/**
 * The per-user document path. Every document is scoped by Firebase UID, and the rules
 * (firestore.rules) permit access only where `request.auth.uid` matches that segment.
 *
 * Throws on a missing uid rather than falling back to a shared or anonymous path: a
 * silent fallback would write one player's preferences somewhere another could read.
 */
export function prefsDocPath(uid: string): string {
  const trimmed = uid.trim();
  if (!trimmed) throw new Error('prefsDocPath requires a signed-in Firebase uid');
  return `users/${trimmed}/prefs/client`;
}

/** The allowlisted preferences currently in localStorage, as a plain document. */
export function collectLocalPrefs(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FIRESTORE_PREF_KEYS) {
    const value = storage.getItem(key);
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * Write a fetched document back into localStorage, keeping only allowlisted keys.
 * Returns the keys actually applied.
 *
 * The filter is not paranoia about our own writer: the document is REMOTE data, and a
 * remote document that grew an unexpected key (a rolled-back client, a console edit, a
 * future version) must not be able to set arbitrary localStorage entries.
 */
export function applyRemotePrefs(
  remote: Record<string, unknown>,
  storage: Pick<Storage, 'setItem'>,
): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(remote)) {
    if (!isSyncablePrefKey(key) || typeof value !== 'string') continue;
    storage.setItem(key, value);
    applied.push(key);
  }
  return applied;
}
