// Firebase Admin SDK wiring: service-account init, ID token verification, and the
// migration-provisioning call the background step in auth_routes.ts's loginHandler
// uses. No account/session logic here: that stays in firebase_auth.ts and
// auth_routes.ts, the only importers of this module.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function firebaseApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

export interface VerifiedFirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /**
   * The upstream provider subject ids the token carries, keyed by Firebase provider
   * id (`'google.com'`, `'apple.com'`, `'oidc.<name>'`, ...). This is what the
   * account resolver matches an EXISTING linked player on: discord_links stores the
   * Discord snowflake and apple_auth_links stores Apple's `sub`, and neither table
   * has ever seen a Firebase uid, so matching on the uid would find nobody and hand
   * every returning linked player a fresh empty account.
   */
  providerSubjects: Record<string, string[]>;
}

/** Normalizes the `firebase.identities` claim, which is typed `any` per provider:
 *  a provider's value may arrive as an array of ids or as a bare string, and only
 *  string ids are usable. Providers left with nothing are dropped entirely, so a
 *  caller can treat a present key as a non-empty list. */
function providerSubjectsOf(identities: unknown): Record<string, string[]> {
  if (!identities || typeof identities !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [provider, raw] of Object.entries(identities as Record<string, unknown>)) {
    const list = (Array.isArray(raw) ? raw : [raw]).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (list.length > 0) out[provider] = list;
  }
  return out;
}

/** Verifies a Firebase ID token server-side (local JWKS-cached verification, no
 *  per-request network call). Returns null on any invalid/expired/malformed token;
 *  never throws. */
export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<VerifiedFirebaseIdentity | null> {
  try {
    const decoded = await getAuth(firebaseApp()).verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      emailVerified: decoded.email_verified === true,
      providerSubjects: providerSubjectsOf(decoded.firebase?.identities),
    };
  } catch {
    return null;
  }
}

/** The background password-migration step (Task 5): after the caller has already
 *  verified the password against the legacy scrypt hash, provisions a Firebase user
 *  with that same verified password. Creates a new Firebase user for an email
 *  Firebase has never seen; updates the password on one that already exists (an
 *  abandoned prior migration attempt, or a Firebase account created some other way
 *  with the same email). Returns the Firebase uid either way. */
export async function createFirebaseUserWithPassword(
  email: string,
  password: string,
): Promise<string> {
  const auth = getAuth(firebaseApp());
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password });
    return existing.uid;
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({ email, password, emailVerified: false });
    return created.uid;
  }
}
