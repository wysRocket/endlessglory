// The client-side Firebase JS SDK wrapper: init plus one function per sign-in
// method this migration wires up (Google, Discord), each returning a Firebase ID
// token for Api.firebaseLogin (online.ts) to exchange for a real session.
//
// Deliberately carries NO email/password function: the existing username/password
// login form never talks to Firebase client-side. The login form asks for a
// USERNAME and Firebase's email/password auth needs an EMAIL, two different and
// not-interchangeable fields, so password accounts keep the legacy path as their
// real verification authority and get only a mirrored Firebase identity, provisioned
// server-side (see docs/superpowers/specs/2026-07-22-firebase-auth-design.md).
//
// This module knows how to talk to Firebase and nothing else: no account, session,
// or game-server concepts live here.
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, OAuthProvider, signInWithPopup } from 'firebase/auth';

// Firebase's client config is PUBLIC BY DESIGN, not a secret: Firebase's security
// model puts enforcement on server-side token verification (server/firebase_admin.ts)
// and on Firestore/Storage rules, never on hiding these values. They are committed
// so a fresh checkout works with no env setup; VITE_FIREBASE_* overrides them for a
// different project (a staging or fork deployment).
const env = import.meta.env;
const FIREBASE_CONFIG = {
  apiKey: String(env.VITE_FIREBASE_API_KEY ?? '') || 'AIzaSyDhPdZeQogAQdeWngSizdjcHlS4Esm6DhY',
  authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN ?? '') || 'endless-glory.firebaseapp.com',
  projectId: String(env.VITE_FIREBASE_PROJECT_ID ?? '') || 'endless-glory',
  appId: String(env.VITE_FIREBASE_APP_ID ?? '') || '1:1025424823312:web:53fe27896d702571b2e695',
  messagingSenderId: String(env.VITE_FIREBASE_SENDER_ID ?? '') || '1025424823312',
};

/**
 * Discord has no built-in Firebase provider: this is Firebase's generic OIDC
 * provider pointed at a Discord OIDC app, configured in the Firebase console
 * (Authentication > Sign-in method > Add new provider > OpenID Connect) under this
 * exact id. It MUST stay in lockstep with the server's DISCORD_PROVIDER_ID
 * (server/firebase_auth.ts): the server matches a returning Discord player to their
 * existing account by the subject id filed under this provider, so a mismatch
 * silently hands them a brand new empty account instead.
 */
export const DISCORD_PROVIDER_ID = 'oidc.discord';

let app: ReturnType<typeof initializeApp> | null = null;

/** The one initialized Firebase app, shared with the Firestore transport
 *  (firestore_sync.ts) so a second initializeApp never happens. */
export function firebaseApp() {
  if (!app) app = initializeApp(FIREBASE_CONFIG);
  return app;
}

/** The signed-in player's Firebase uid, or null when this session has no Firebase
 *  identity (a legacy password login, which never opens a Firebase session
 *  client-side). Preference sync is keyed on it. */
export function currentFirebaseUid(): string | null {
  return getAuth(firebaseApp()).currentUser?.uid ?? null;
}

/** True when a rejected sign-in was the player dismissing the popup rather than a
 *  real failure, so the caller can fall silent instead of showing an error. */
export function isSignInCancelled(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/user-cancelled'
  );
}

/** True when the rejection came from the Firebase SDK rather than from this game's
 *  own API. Firebase's `auth/*` codes are developer diagnostics, not player copy, so
 *  the caller shows one generic message for them and reserves the localized
 *  API-error path for refusals the server actually decided. */
export function isFirebaseSdkError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('auth/');
}

/** Opens the Google sign-in popup; resolves to a Firebase ID token. */
export async function signInWithGoogle(): Promise<string> {
  const credential = await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider());
  return credential.user.getIdToken();
}

/** Opens the Discord (OIDC) sign-in popup; resolves to a Firebase ID token. */
export async function signInWithDiscord(): Promise<string> {
  const credential = await signInWithPopup(
    getAuth(firebaseApp()),
    new OAuthProvider(DISCORD_PROVIDER_ID),
  );
  return credential.user.getIdToken();
}
