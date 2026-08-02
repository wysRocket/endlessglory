import { describe, expect, it } from 'vitest';
import { resolveAuthGate } from '../src/dashboard/auth_gate_core';
import { ApiError, isAuthError } from '../src/net/online';

function fakeApi(
  overrides: Partial<{
    token: string | null;
    restoreSession(): boolean;
    getAccount(): Promise<unknown>;
  }>,
) {
  return {
    token: null,
    restoreSession: () => false,
    getAccount: async () => ({
      username: 'x',
      email: '',
      createdAt: '',
      characterCount: 0,
      twoFactorEnabled: false,
    }),
    ...overrides,
  };
}

describe('dashboard auth gate', () => {
  it('shows the login form when there is no session to restore', async () => {
    const api = fakeApi({ restoreSession: () => false });
    expect(await resolveAuthGate(api as never, isAuthError)).toBe('login');
  });

  it('shows the shell when restore succeeds and the server confirms it', async () => {
    const api = fakeApi({ restoreSession: () => true });
    expect(await resolveAuthGate(api as never, isAuthError)).toBe('authenticated');
  });

  it('falls back to login when the server rejects the restored token (401)', async () => {
    const api = fakeApi({
      restoreSession: () => true,
      getAccount: async () => {
        throw new ApiError('unauthorized', 401);
      },
    });
    expect(await resolveAuthGate(api as never, isAuthError)).toBe('login');
  });

  it('stays authenticated on a transient error, matching loadAccountPortal in src/main.ts', async () => {
    const api = fakeApi({
      restoreSession: () => true,
      getAccount: async () => {
        throw new Error('network blip, no status');
      },
    });
    expect(await resolveAuthGate(api as never, isAuthError)).toBe('authenticated');
  });
});
