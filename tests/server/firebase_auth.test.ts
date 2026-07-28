// Route-level coverage for POST /api/auth/firebase (server/firebase_auth.ts).
//
// Firebase itself is mocked out entirely (never a real project, never a network
// call): by the time the route runs, a token has already been verified, so what is
// under test is purely the ACCOUNT RESOLUTION ladder: an already-linked
// firebase_uid, then a provider subject already recorded in discord_links /
// apple_auth_links, then a fresh signup.
//
// The resolution order is the load-bearing part. Matching the wrong thing is not a
// cosmetic bug: matching too loosely hands one player another player's account, and
// matching too tightly hands a returning player a brand new empty one instead of
// their characters. Both directions are pinned below.

// server/db.ts builds a pg Pool at module load and throws if DATABASE_URL is unset;
// firebase_auth.ts imports it. The pool never connects: every read/write is mocked.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_firebase_auth_test';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedFirebaseIdentity } from '../../server/firebase_admin';
import { type FakeRes, fakeCtx } from './helpers';

vi.mock('../../server/firebase_admin', () => ({ verifyFirebaseIdToken: vi.fn() }));
vi.mock('../../server/db', async () => {
  const actual = await vi.importActual<typeof import('../../server/db')>('../../server/db');
  return {
    ...actual,
    pool: {},
    accountForFirebaseUid: vi.fn(),
    setFirebaseUid: vi.fn().mockResolvedValue(undefined),
    saveToken: vi.fn().mockResolvedValue(undefined),
    touchLogin: vi.fn().mockResolvedValue(undefined),
    accountById: vi.fn().mockResolvedValue({ username: 'testuser', email: 'player@example.com' }),
    moderationStatusForAccount: vi.fn().mockResolvedValue({ locked: false }),
    backfillAccountEmailIfEmpty: vi.fn().mockResolvedValue(undefined),
    createAccount: vi.fn(),
    findAccount: vi.fn().mockResolvedValue(null),
  };
});
vi.mock('../../server/discord_db', () => ({ accountForDiscord: vi.fn().mockResolvedValue(null) }));
vi.mock('../../server/apple_auth_db', () => ({ accountForApple: vi.fn().mockResolvedValue(null) }));

import { accountForApple } from '../../server/apple_auth_db';
import {
  accountById,
  accountForFirebaseUid,
  createAccount,
  findAccount,
  moderationStatusForAccount,
  setFirebaseUid,
} from '../../server/db';
import { accountForDiscord } from '../../server/discord_db';
import { verifyFirebaseIdToken } from '../../server/firebase_admin';
import { routes } from '../../server/firebase_auth';

const PATH = '/api/auth/firebase';
const TOKEN_RE = /^[0-9a-f]{64}$/;

/** A verified identity as firebase_admin hands it to the route. */
function identity(overrides: Partial<VerifiedFirebaseIdentity> = {}): VerifiedFirebaseIdentity {
  return {
    uid: 'uid-1',
    email: 'player@example.com',
    emailVerified: true,
    providerSubjects: {},
    ...overrides,
  };
}

/** Drive the route handler with a body and read the response off the FakeRes. */
async function post(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const ctx = fakeCtx({ method: 'POST', url: PATH, body });
  const route = routes.find((r) => r.path === PATH);
  if (!route) throw new Error(`no route registered for ${PATH}`);
  await route.handler(ctx);
  const res = ctx.res as unknown as FakeRes;
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}

afterEach(() => {
  vi.clearAllMocks();
  // clearAllMocks drops the default resolutions above, so restore the ones every
  // case relies on staying benign unless it overrides them.
  vi.mocked(accountForDiscord).mockResolvedValue(null);
  vi.mocked(accountForApple).mockResolvedValue(null);
  vi.mocked(findAccount).mockResolvedValue(null);
  vi.mocked(setFirebaseUid).mockResolvedValue(undefined);
  vi.mocked(moderationStatusForAccount).mockResolvedValue({ locked: false } as never);
  vi.mocked(accountById).mockResolvedValue({
    username: 'testuser',
    email: 'player@example.com',
  } as never);
});

describe('POST /api/auth/firebase', () => {
  it('401s an invalid token before touching the database', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(null);
    const res = await post({ idToken: 'bad' });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'firebase_auth.invalid_token' });
    expect(accountForFirebaseUid).not.toHaveBeenCalled();
  });

  it('401s a missing idToken the same way, without special-casing it', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(null);
    const res = await post({});
    expect(res.status).toBe(401);
    expect(verifyFirebaseIdToken).toHaveBeenCalledWith('');
  });

  it('logs an already-linked account straight through without walking the provider tables', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(identity());
    vi.mocked(accountForFirebaseUid).mockResolvedValue(99);
    const res = await post({ idToken: 'good' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: expect.stringMatching(TOKEN_RE),
      username: 'testuser',
      emailMissing: false,
    });
    expect(accountForDiscord).not.toHaveBeenCalled();
    expect(accountForApple).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('migrates an existing Discord-linked account by its Discord subject, not the Firebase uid', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(
      identity({
        uid: 'firebase-uid-abc',
        providerSubjects: { 'oidc.discord': ['198765432109876543'] },
      }),
    );
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(accountForDiscord).mockResolvedValue(55);
    const res = await post({ idToken: 'good' });
    expect(res.status).toBe(200);
    // The Discord snowflake is what discord_links stores; the Firebase uid is not.
    expect(accountForDiscord).toHaveBeenCalledWith(expect.anything(), '198765432109876543');
    // The uid is recorded so later sign-ins take the fast first branch.
    expect(setFirebaseUid).toHaveBeenCalledWith(expect.anything(), 55, 'firebase-uid-abc');
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('migrates an existing Apple-linked account by its Apple subject', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(
      identity({
        uid: 'firebase-uid-def',
        providerSubjects: { 'apple.com': ['001234.abcdef.0100'] },
      }),
    );
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(accountForApple).mockResolvedValue(66);
    const res = await post({ idToken: 'good' });
    expect(res.status).toBe(200);
    expect(accountForApple).toHaveBeenCalledWith(expect.anything(), '001234.abcdef.0100');
    expect(setFirebaseUid).toHaveBeenCalledWith(expect.anything(), 66, 'firebase-uid-def');
  });

  // The takeover guard. A Google `sub` and a Discord snowflake are both opaque
  // numeric strings, so a resolver that tried every subject against every table
  // would let a Google user claim the Discord-linked account that happens to share
  // the id. Each provider must only ever be looked up in its own table.
  it('never matches a Google subject against the Discord or Apple link tables', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(
      identity({
        uid: 'firebase-uid-ghi',
        providerSubjects: { 'google.com': ['198765432109876543'] },
      }),
    );
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(createAccount).mockResolvedValue({ id: 123 } as never);
    const res = await post({ idToken: 'good' });
    expect(res.status).toBe(200);
    expect(accountForDiscord).not.toHaveBeenCalled();
    expect(accountForApple).not.toHaveBeenCalled();
    // With no legitimate match it must fall through to a fresh account, never to
    // whatever account happened to own that id under another provider.
    expect(createAccount).toHaveBeenCalled();
    expect(setFirebaseUid).toHaveBeenCalledWith(expect.anything(), 123, 'firebase-uid-ghi');
  });

  it('provisions a brand new account when nothing matches at all', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(
      identity({ uid: 'fresh-uid', email: 'newplayer@example.com' }),
    );
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(createAccount).mockResolvedValue({ id: 123 } as never);
    const res = await post({ idToken: 'good' });
    expect(res.status).toBe(200);
    // The username seeds off the email local part, and the placeholder password is
    // flagged as one the owner never chose.
    expect(createAccount).toHaveBeenCalledWith('newplayer', expect.any(String), expect.anything(), {
      passwordSet: false,
    });
    expect(setFirebaseUid).toHaveBeenCalledWith(expect.anything(), 123, 'fresh-uid');
  });

  it('falls back to a random username when the email local part is unusable', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(
      identity({ uid: 'fresh-uid-2', email: null }),
    );
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(createAccount).mockResolvedValue({ id: 124 } as never);
    const res = await post({ idToken: 'good' });
    expect(res.status).toBe(200);
    const [username] = vi.mocked(createAccount).mock.calls[0] as unknown as [string];
    expect(username).toMatch(/^player[0-9a-f]{6}$/);
  });

  it('403s a locked account after resolution, before issuing a session', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(identity());
    vi.mocked(accountForFirebaseUid).mockResolvedValue(99);
    vi.mocked(moderationStatusForAccount).mockResolvedValue({
      locked: true,
      banned: true,
      reason: 'banned',
      message: 'This account has been banned.',
    } as never);
    const res = await post({ idToken: 'good' });
    expect(res.status).toBe(403);
    expect(res.body).not.toMatchObject({ token: expect.any(String) });
  });
});
