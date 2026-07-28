// The Firestore transport for client preference sync: the only module in the tree that
// talks to the firebase/firestore SDK.
//
// Split from firestore_prefs.ts on purpose. That module is pure policy (the closed
// allowlist, the path rule, the filters) and a Vitest drives it with no SDK at all;
// this one is the thin IO shell around it. The boundary test
// (tests/firestore_boundary.test.ts) asserts neither ever reaches src/sim/ or server/.
//
// Everything here is best-effort. Preferences already live in localStorage and keep
// working when Firestore is unreachable, so every failure path here is "log and carry
// on", never a thrown error that could interrupt a sign-in.
import { doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { firebaseApp } from './firebase_client';
import { applyRemotePrefs, collectLocalPrefs, prefsDocPath } from './firestore_prefs';

export interface PrefSyncResult {
  /** 'pulled' when the remote document won, 'pushed' when this device seeded it. */
  readonly direction: 'pulled' | 'pushed' | 'skipped';
  /** The allowlisted keys moved in that direction. */
  readonly keys: readonly string[];
}

/**
 * Reconcile this device's preferences with the signed-in player's cloud document.
 *
 * Policy, per the scope spec: last write wins per document, and there is no correctness
 * claim to preserve. On sign-in the REMOTE document wins if one exists (that is the
 * point of the feature: a new device inherits the player's settings); otherwise this
 * device seeds it. Anything finer would be inventing a merge conflict model for data
 * that does not warrant one.
 *
 * Never throws: a preference sync must not be able to fail a sign-in.
 */
export async function syncPrefsForUid(
  uid: string,
  storage: Storage = localStorage,
): Promise<PrefSyncResult> {
  try {
    const ref = doc(getFirestore(firebaseApp()), prefsDocPath(uid));
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) {
      const applied = applyRemotePrefs(snapshot.data() as Record<string, unknown>, storage);
      return { direction: 'pulled', keys: applied };
    }
    const local = collectLocalPrefs(storage);
    await setDoc(ref, local);
    return { direction: 'pushed', keys: Object.keys(local) };
  } catch (error) {
    console.warn('[firestore] preference sync unavailable, staying on local settings', error);
    return { direction: 'skipped', keys: [] };
  }
}

/**
 * Push this device's current preferences up, overwriting the cloud document. Call after
 * the player changes settings; a dropped push just means the next device sees slightly
 * stale preferences.
 */
export async function pushPrefsForUid(uid: string, storage: Storage = localStorage): Promise<void> {
  try {
    await setDoc(doc(getFirestore(firebaseApp()), prefsDocPath(uid)), collectLocalPrefs(storage));
  } catch (error) {
    console.warn('[firestore] could not save preferences to the cloud', error);
  }
}
