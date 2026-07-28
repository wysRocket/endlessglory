// server/firebase_admin.ts against a fully mocked firebase-admin: no network, no
// service account, no live Firebase project. What matters here is the failure
// behavior, since both call sites depend on it: verification must swallow every bad
// token into null rather than throw (a thrown error would 500 a login attempt), and
// provisioning must treat an already-existing Firebase user as an update rather than
// a hard failure (an abandoned earlier migration attempt must not lock the account
// out of ever provisioning).
import { afterEach, describe, expect, it, vi } from 'vitest';

// getApps() is mocked empty below so every case exercises the real init path, which
// reads this env var. `cert` and `initializeApp` are mocked, so the value only has to
// parse as JSON: it never reaches Google and is not a credential.
process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||= JSON.stringify({
  project_id: 'test-project',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  private_key: 'not-a-real-key',
});

const verifyIdToken = vi.fn();
const getUserByEmail = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
  cert: vi.fn((value: unknown) => value),
  getApps: vi.fn(() => []),
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken, getUserByEmail, createUser, updateUser })),
}));

describe('server/firebase_admin', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('verifyFirebaseIdToken returns the decoded token on success', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'uid-1',
      email: 'player@example.com',
      email_verified: true,
    });
    const { verifyFirebaseIdToken } = await import('../server/firebase_admin');
    await expect(verifyFirebaseIdToken('a.valid.token')).resolves.toEqual({
      uid: 'uid-1',
      email: 'player@example.com',
      emailVerified: true,
    });
  });

  it('verifyFirebaseIdToken returns null on a rejected token', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid signature'));
    const { verifyFirebaseIdToken } = await import('../server/firebase_admin');
    await expect(verifyFirebaseIdToken('garbage')).resolves.toBeNull();
  });

  it('createFirebaseUserWithPassword creates a new user for an unseen email', async () => {
    getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });
    createUser.mockResolvedValue({ uid: 'new-uid' });
    const { createFirebaseUserWithPassword } = await import('../server/firebase_admin');
    await expect(
      createFirebaseUserWithPassword('player@example.com', 'their-real-password'),
    ).resolves.toBe('new-uid');
    expect(createUser).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'their-real-password',
      emailVerified: false,
    });
  });

  it('createFirebaseUserWithPassword updates the password on an abandoned prior attempt', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'existing-uid' });
    updateUser.mockResolvedValue({ uid: 'existing-uid' });
    const { createFirebaseUserWithPassword } = await import('../server/firebase_admin');
    await expect(
      createFirebaseUserWithPassword('player@example.com', 'their-real-password'),
    ).resolves.toBe('existing-uid');
    expect(updateUser).toHaveBeenCalledWith('existing-uid', { password: 'their-real-password' });
    expect(createUser).not.toHaveBeenCalled();
  });
});
