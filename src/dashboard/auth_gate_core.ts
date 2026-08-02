// Pure auth-gate decision for the dashboard shell. Mirrors loadAccountPortal's
// pattern in src/main.ts exactly: restore, revalidate server-side, and on an
// AUTH error (401/403) clear the session and show login; on a TRANSIENT error,
// stay authenticated with cached identity rather than bouncing a valid session.
//
// Lives in its own zero-dependency module (not inline in shell.ts) so tests can
// import it without pulling in shell.ts's other static imports (the three page
// painters), which do not exist until later tasks in this plan land: ESM static
// imports resolve eagerly regardless of which bindings a caller actually reads,
// so a test importing shell.ts directly would fail to resolve those modules
// even though it never uses them.
//
// The auth-vs-transient classifier is INJECTED, not imported from net/online:
// this file is a registered UI_PURE_CORES module (tests/architecture.test.ts),
// which forbids a pure core from importing the net/ layer. shell.ts passes the
// real isAuthError in; tests pass a fake.

export type AuthGateResult = 'login' | 'authenticated';

/** Pure decision: given an Api-shaped client and an auth-error classifier,
 *  should the shell show the login form or the authenticated pages. Takes an
 *  interface subset, not the concrete Api class, so it is testable with a
 *  fake. */
export async function resolveAuthGate(
  api: {
    restoreSession(): boolean;
    getAccount(): Promise<unknown>;
  },
  isAuthError: (err: unknown) => boolean,
): Promise<AuthGateResult> {
  if (!api.restoreSession()) return 'login';
  try {
    await api.getAccount();
    return 'authenticated';
  } catch (err) {
    if (isAuthError(err)) return 'login';
    // Transient error: the session may still be valid, keep it.
    return 'authenticated';
  }
}
