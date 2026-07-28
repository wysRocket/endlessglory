// The client-side Firebase SDK wrapper (src/net/firebase_client.ts), driven against
// a fully mocked firebase/app + firebase/auth: no network, no real project.
//
// What matters here is that each sign-in method reaches the RIGHT provider and
// hands back a raw ID token (the only thing Api.firebaseLogin sends the server),
// and that a cancelled popup is reported as a cancellation rather than an error the
// UI would surface as a failed sign-in.
import { afterEach, describe, expect, it, vi } from 'vitest';

const signInWithPopup = vi.fn();
const getIdToken = vi.fn();
const GoogleAuthProvider = vi.fn(function GoogleAuthProviderMock(this: { id: string }) {
  this.id = 'google.com';
});
const OAuthProvider = vi.fn(function OAuthProviderMock(this: { id: string }, providerId: string) {
  this.id = providerId;
});

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})), getApps: vi.fn(() => []) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('src/net/firebase_client', () => {
  it('signInWithGoogle returns the ID token from the popup result', async () => {
    signInWithPopup.mockResolvedValue({ user: { getIdToken } });
    getIdToken.mockResolvedValue('google-id-token');
    const { signInWithGoogle } = await import('../src/net/firebase_client');
    await expect(signInWithGoogle()).resolves.toBe('google-id-token');
    expect(GoogleAuthProvider).toHaveBeenCalled();
    expect(OAuthProvider).not.toHaveBeenCalled();
  });

  // Discord is not a Firebase built-in: it is the generic OIDC provider pointed at a
  // Discord OIDC app. The provider id must match the one the server resolves
  // subjects under (server/firebase_auth.ts DISCORD_PROVIDER_ID), or a returning
  // Discord player is never matched to their existing account.
  it('signInWithDiscord goes through the oidc.discord OIDC provider', async () => {
    signInWithPopup.mockResolvedValue({ user: { getIdToken } });
    getIdToken.mockResolvedValue('discord-id-token');
    const { signInWithDiscord } = await import('../src/net/firebase_client');
    await expect(signInWithDiscord()).resolves.toBe('discord-id-token');
    expect(OAuthProvider).toHaveBeenCalledWith('oidc.discord');
  });

  it('reports a closed popup as a cancellation, not a sign-in failure', async () => {
    signInWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    const { signInWithGoogle, isSignInCancelled } = await import('../src/net/firebase_client');
    await expect(signInWithGoogle()).rejects.toSatisfy(isSignInCancelled);
  });

  it('does not treat a real sign-in error as a cancellation', async () => {
    const { isSignInCancelled } = await import('../src/net/firebase_client');
    expect(isSignInCancelled({ code: 'auth/network-request-failed' })).toBe(false);
    expect(isSignInCancelled(new Error('boom'))).toBe(false);
  });

  it('initializes the app once across several sign-ins', async () => {
    signInWithPopup.mockResolvedValue({ user: { getIdToken } });
    getIdToken.mockResolvedValue('t');
    const { initializeApp } = await import('firebase/app');
    const { signInWithGoogle, signInWithDiscord } = await import('../src/net/firebase_client');
    await signInWithGoogle();
    await signInWithDiscord();
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });
});

describe('isFirebaseSdkError', () => {
  // The split decides which message a failed sign-in shows: Firebase's own auth/*
  // codes are developer diagnostics, so they get one generic line, while a refusal
  // our server decided (a ban, a rate limit) must still reach the localized
  // API-error path rather than being flattened into "could not sign in".
  it('recognizes a Firebase SDK rejection', async () => {
    const { isFirebaseSdkError } = await import('../src/net/firebase_client');
    expect(isFirebaseSdkError({ code: 'auth/network-request-failed' })).toBe(true);
    expect(isFirebaseSdkError({ code: 'auth/popup-blocked' })).toBe(true);
  });

  it('does not claim a server API error as its own', async () => {
    const { isFirebaseSdkError } = await import('../src/net/firebase_client');
    expect(isFirebaseSdkError({ code: 'moderation.banned' })).toBe(false);
    expect(isFirebaseSdkError({ code: 'firebase_auth.invalid_token' })).toBe(false);
    expect(isFirebaseSdkError(new Error('request failed (500)'))).toBe(false);
    expect(isFirebaseSdkError(null)).toBe(false);
  });
});
