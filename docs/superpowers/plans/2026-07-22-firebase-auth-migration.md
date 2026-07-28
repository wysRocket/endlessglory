# Firebase Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase Auth as the identity front door for the web game client's Google and Discord sign-in, while the existing username/password login stays exactly as it is today (a silent, best-effort Firebase identity gets provisioned in the background on a successful legacy login), Postgres stays the sole source of truth for accounts, sessions, and game data, and every existing Discord/Apple-linked account migrates transparently on its first post-cutover login.

**Architecture:** A new server module (`server/firebase_auth.ts`) verifies Firebase ID tokens via `firebase-admin` for the Google/Discord/Apple sign-in paths, resolves them to an `accounts` row (by an already-linked `firebase_uid`, or by matching the token's provider subject id against the existing `discord_links`/`apple_auth_links` tables, or, if nothing matches, provisioning a brand new account), then issues the same `auth_tokens` session every other login path already issues. Separately, the existing `/api/login` (username/password) handler in `server/auth_routes.ts` gains one small addition: on a successful legacy password verification, if the account has an email on file and no `firebase_uid` yet, it silently provisions a shadow Firebase user with that same verified password: the client-side password form never changes, and a Firebase outage never blocks a legacy login (the provisioning step is best-effort and never fails the request).

**Tech Stack:** `firebase-admin` (server), `firebase` (client SDK), this repo's existing `RouteDef`/Postgres/Vitest stack. No Firestore, no new database.

**Scope note (read before starting):** this plan covers the **web client's Google and Discord sign-in, plus a background migration hook on the existing password login**. Two things are explicitly out of scope, cut during planning after finding real gaps the brainstorming/design pass had not caught:

- **Apple Sign-In.** In this codebase it is currently native-iOS-only (`#btn-login-apple`, gated on `NATIVE_APP && isNativeIos()`, using Apple's native SDK plus `native_attestation.ts`), a materially different mechanism from the web OAuth-popup flow Discord/Google use. Wiring Firebase into the native app's Apple sign-in is real follow-on work. This plan's server-side code (`server/firebase_auth.ts`) DOES still resolve an Apple-provider Firebase token against `apple_auth_links` if one ever arrives (the logic is symmetric with Discord and costs nothing extra to include), but no client work wires up a path that would ever produce one yet.
- **Firebase-side email/password sign-in.** The client's existing login form asks for a **username**, but Firebase's email/password auth needs an **email**: two different, not-interchangeable fields (`accounts.username` vs. the separate, nullable `accounts.email`). Rather than change the login UX (a real product decision, out of scope for this pass), password accounts keep using the untouched legacy path forever as their real verification authority; Firebase only gets a *mirrored* identity for them, provisioned silently in the background. See Task 5 below.

See the design spec, [`docs/superpowers/specs/2026-07-22-firebase-auth-design.md`](../specs/2026-07-22-firebase-auth-design.md), for the full rationale, including why `server/github.ts` is untouched (it is a developer-badge linking feature, not a sign-in method).

---

## File structure

| File | Responsibility |
|---|---|
| `server/db.ts` | Modified: `firebase_uid` column on the core `accounts` table, `AccountRow`/`findAccount` extended to carry it, plus `accountForFirebaseUid`/`setFirebaseUid` query helpers. |
| `server/firebase_admin.ts` | New: Firebase Admin SDK init from an env-provided service account, `verifyFirebaseIdToken`, and `createFirebaseUserWithPassword` (the background migration helper Task 5 uses). |
| `server/firebase_auth.ts` | New: the `RouteDef` module for `POST /api/auth/firebase` (Google/Discord/Apple token resolution, provider-subject matching, fresh-signup provisioning). |
| `server/auth_routes.ts` | Modified: `loginHandler` gains the best-effort background Firebase provisioning step on a successful legacy password login. |
| `server/http/registry.ts` | Modified: registers `firebase_auth.ts`'s routes. |
| `server/http/error_codes.ts` | Modified: one new `firebaseAuth.invalid_token` code. |
| `src/ui/api_error_i18n.ts` + `src/ui/i18n.catalog/api_error.ts` | Modified: the matching client-side error mapping + English catalog entry. |
| `src/net/firebase_client.ts` | New: the client-side Firebase JS SDK wrapper (init, `signInWithGoogle`, `signInWithDiscord`). |
| `src/net/online.ts` | Modified: `Api.firebaseLogin(idToken)`, mirroring the existing `Api.appleLogin`. |
| `index.html` | Modified: a new `#btn-login-google` button, matching the existing `#btn-login-discord` markup. |
| `src/main.ts` | Modified: wires the new Google button, repoints `#btn-login-discord`'s click handler through Firebase. The password form (`doAuth`) is NOT touched. |
| `package.json` | Modified: adds `firebase-admin` and `firebase` dependencies. |
| `tests/firebase_auth_db.test.ts` | New: unit tests for the two `db.ts` helpers. |
| `tests/firebase_admin.test.ts` | New: unit tests for `server/firebase_admin.ts`, mocking the `firebase-admin` package. |
| `tests/server/auth.login.test.ts` | Modified: covers the new background-provisioning side effect on the existing login path. |
| `tests/server/firebase_auth.test.ts` | New: route-level tests for `server/firebase_auth.ts`. |
| `tests/firebase_client.test.ts` | New: unit tests for the client SDK wrapper. |

---

### Task 1: `accounts.firebase_uid` column and its query helpers

**Files:**
- Modify: `server/db.ts`
- Test: `tests/firebase_auth_db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_firebase_test';
import { accountForFirebaseUid, setFirebaseUid } from '../server/db';

describe('firebase_uid account helpers', () => {
  it('accountForFirebaseUid returns the matching account id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 42 }] });
    const pool = { query } as never;
    await expect(accountForFirebaseUid(pool, 'uid-abc')).resolves.toBe(42);
    expect(query).toHaveBeenCalledWith('SELECT id FROM accounts WHERE firebase_uid = $1', [
      'uid-abc',
    ]);
  });

  it('accountForFirebaseUid returns null on no match', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as never;
    await expect(accountForFirebaseUid(pool, 'uid-missing')).resolves.toBeNull();
  });

  it('setFirebaseUid writes the column for the given account', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as never;
    await setFirebaseUid(pool, 7, 'uid-xyz');
    expect(query).toHaveBeenCalledWith('UPDATE accounts SET firebase_uid = $1 WHERE id = $2', [
      'uid-xyz',
      7,
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/firebase_auth_db.test.ts`
Expected: FAIL, `accountForFirebaseUid`/`setFirebaseUid` are not exported from `../server/db`.

- [ ] **Step 3: Add the column, extend AccountRow, and add the two helpers**

In `server/db.ts`, find the block of single-column `ALTER TABLE accounts ADD COLUMN` statements (the one ending with `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS totp_last_window BIGINT;`, per `grep -n "ALTER TABLE accounts" server/db.ts`). Add, immediately after that block:

```sql
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE;
```

In the `AccountRow` interface (`grep -n "interface AccountRow"`), add the new field so `findAccount`'s caller (Task 5) can read it:

```typescript
  // Set once this account has a linked Firebase identity (see server/firebase_auth.ts
  // and the background-provisioning step in auth_routes.ts's loginHandler).
  firebase_uid?: string | null;
```

In `findAccount`'s `SELECT` list, add `firebase_uid` alongside the existing columns:

```typescript
    `SELECT id, username, password_hash, email, firebase_uid, totp_secret, totp_enabled_at, totp_last_window
     FROM accounts WHERE username = $1`,
```

Then, near `accountForToken`/`saveToken` (the other core `accounts` query helpers in the same file), add two exported functions taking an explicit `pool: Pool` parameter (so they are unit-testable with a fake pool, matching the `apple_auth_db.ts` convention, even though the module also keeps a real singleton `pool` for its own non-test call sites):

```typescript
export async function accountForFirebaseUid(pool: Pool, firebaseUid: string): Promise<number | null> {
  const result = await pool.query('SELECT id FROM accounts WHERE firebase_uid = $1', [
    firebaseUid,
  ]);
  return result.rows[0]?.id ?? null;
}

export async function setFirebaseUid(pool: Pool, accountId: number, firebaseUid: string): Promise<void> {
  await pool.query('UPDATE accounts SET firebase_uid = $1 WHERE id = $2', [
    firebaseUid,
    accountId,
  ]);
}
```

`Pool` is already imported in `db.ts` (used throughout the file); no new import needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/firebase_auth_db.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the broader account tests to confirm the SELECT/interface change is safe**

Run: `npx vitest run tests/server/auth.login.test.ts tests/server/auth.attestation.test.ts`
Expected: still green (adding a nullable field/column is additive; no existing assertion should reference an exhaustive column list).

- [ ] **Step 6: Format and commit**

```bash
npx @biomejs/biome check --write server/db.ts tests/firebase_auth_db.test.ts
git add server/db.ts tests/firebase_auth_db.test.ts
git commit -m "feat(auth): add accounts.firebase_uid column and its query helpers"
```

---

### Task 2: `server/firebase_admin.ts`: SDK init and token verification

**Files:**
- Create: `server/firebase_admin.ts`
- Test: `tests/firebase_admin.test.ts`
- Modify: `package.json` (add `firebase-admin`)

- [ ] **Step 1: Add the dependency**

```bash
npm install firebase-admin
```

- [ ] **Step 2: Write the failing test**

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/firebase_admin.test.ts`
Expected: FAIL, `../server/firebase_admin` does not exist.

- [ ] **Step 4: Write the implementation**

```typescript
// server/firebase_admin.ts
//
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
}

/** Verifies a Firebase ID token server-side (local JWKS-cached verification, no
 *  per-request network call). Returns null on any invalid/expired/malformed token;
 *  never throws. */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseIdentity | null> {
  try {
    const decoded = await getAuth(firebaseApp()).verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      emailVerified: decoded.email_verified === true,
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/firebase_admin.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run tsc**

Run: `npx tsc --noEmit`
Expected: no new errors. (`firebase-admin`'s types ship with the package; no `@types/` install needed.)

- [ ] **Step 7: Format and commit**

```bash
npx @biomejs/biome check --write server/firebase_admin.ts tests/firebase_admin.test.ts package.json
git add server/firebase_admin.ts tests/firebase_admin.test.ts package.json package-lock.json
git commit -m "feat(auth): add the Firebase Admin SDK wiring (server/firebase_admin.ts)"
```

---

### Task 3: Error code and the client-side i18n mapping

**Files:**
- Modify: `server/http/error_codes.ts`
- Modify: `src/ui/api_error_i18n.ts`
- Modify: `src/ui/i18n.catalog/api_error.ts`
- Test: `tests/server/http/error_codes.test.ts`, `tests/api_error_code_parity.test.ts` (existing snapshot tests, extended)

- [ ] **Step 1: Write the failing tests**

In `tests/server/http/error_codes.test.ts`, find the `EXPECTED_CODES` array and add, keeping the array's existing sort order (alphabetical by code, matching the surrounding entries):

```typescript
  'firebaseAuth.invalid_token',
```

In `tests/api_error_code_parity.test.ts`, find the `KNOWN_CODES` array and add the same line, in the same sorted position.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/http/error_codes.test.ts tests/api_error_code_parity.test.ts`
Expected: FAIL, the code is not yet in `ERROR_CODES`/`API_ERROR_KEYS`/the catalog.

- [ ] **Step 3: Append the error code**

In `server/http/error_codes.ts`, immediately before the closing `} as const);` (the same insertion point `new:endpoint` itself targets), add:

```typescript
  // firebaseAuth: the Firebase ID token failed verification (expired, malformed,
  // wrong project). 401.
  'firebaseAuth.invalid_token': { params: [] },
```

- [ ] **Step 4: Add the client-side mapping and English catalog entry**

In `src/ui/api_error_i18n.ts`, find `API_ERROR_KEYS` and add, in the same sorted position as the code above:

```typescript
  'firebaseAuth.invalid_token': 'apiError.firebaseAuth.invalidToken',
```

In `src/ui/i18n.catalog/api_error.ts`, find `apiErrorStrings` and add a new top-level block:

```typescript
  firebaseAuth: {
    invalidToken: 'Sign-in failed. Try again.',
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/server/http/error_codes.test.ts tests/api_error_code_parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Format and commit**

```bash
npx @biomejs/biome check --write server/http/error_codes.ts src/ui/api_error_i18n.ts src/ui/i18n.catalog/api_error.ts tests/server/http/error_codes.test.ts tests/api_error_code_parity.test.ts
git add server/http/error_codes.ts src/ui/api_error_i18n.ts src/ui/i18n.catalog/api_error.ts tests/server/http/error_codes.test.ts tests/api_error_code_parity.test.ts
git commit -m "feat(auth): add firebaseAuth.invalid_token error code and its i18n mapping"
```

---

### Task 4: `server/firebase_auth.ts`: the token-resolution route

**Files:**
- Create: `server/firebase_auth.ts`
- Modify: `server/http/registry.ts`

This route is ONLY reached for the Google/Discord/Apple sign-in paths, which always carry a Firebase-verified token by the time the server sees the request (unlike password login, handled separately in Task 5). It follows `server/apple_auth.ts`'s shape: an unauthenticated, rate-limited `RouteDef` (a login endpoint is never gated by the bearer-auth guard, since the caller does not have a session yet), a session-issuing helper mirroring `issueAppleSession`.

- [ ] **Step 1: Write the module**

```typescript
// server/firebase_auth.ts
//
// The Firebase Auth token-resolution surface for Google/Discord/Apple sign-in
// (design spec: docs/superpowers/specs/2026-07-22-firebase-auth-design.md). One
// route, POST /api/auth/firebase: verify the client's Firebase ID token, then
// resolve it to an accounts row by (in order) an already-linked firebase_uid, a
// matching discord_links/apple_auth_links external subject id, or, with no match
// at all, a fresh signup. Password-account migration is a SEPARATE, background
// step on the existing /api/login path (server/auth_routes.ts, Task 5): this route
// is never reached by the password login form.
import type http from 'node:http';
import { accountForApple } from './apple_auth_db';
import { findAccount, hashPassword } from './auth';
import {
  accountById,
  accountForFirebaseUid,
  createAccount,
  moderationStatusForAccount,
  newToken,
  pool,
  saveToken,
  setFirebaseUid,
  touchLogin,
} from './db';
import { accountForDiscord } from './discord_db';
import { verifyFirebaseIdToken } from './firebase_admin';
import { withBody } from './http/middleware/body';
import type { Ctx, RouteDef } from './http/types';
import { isUniqueViolation, json, moderationErrorBody } from './http_util';
import { rateLimited, requestIp } from './ratelimit';

async function issueFirebaseSession(
  accountId: number,
  req: http.IncomingMessage,
): Promise<{ token: string; username: string; emailMissing: boolean }> {
  await touchLogin(accountId, {
    ip: requestIp(req),
    userAgent: String(req.headers['user-agent'] ?? ''),
  });
  const token = newToken();
  await saveToken(token, accountId, undefined, 'full', 'firebase');
  const account = await accountById(accountId);
  return {
    token,
    username: account?.username ?? 'player',
    emailMissing: !account?.email?.trim(),
  };
}

/** Provider-linked migration match: a Discord or Apple subject already recorded in
 *  discord_links/apple_auth_links resolves straight to its account (design spec
 *  Section 6, first bullet). */
async function matchByProviderSubject(providerId: string): Promise<number | null> {
  const [byDiscord, byApple] = await Promise.all([
    accountForDiscord(pool, providerId),
    accountForApple(pool, providerId),
  ]);
  return byDiscord ?? byApple ?? null;
}

async function provisionFreshAccount(
  identity: { uid: string; email: string | null },
  req: http.IncomingMessage,
): Promise<number> {
  const base = (identity.email?.split('@')[0] ?? 'player').replace(/[^A-Za-z0-9_]/g, '').slice(0, 18) || 'player';
  const meta = { ip: requestIp(req), userAgent: String(req.headers['user-agent'] ?? '') };
  for (let attempt = 0; attempt < 8; attempt++) {
    const username = attempt === 0 ? base : `${base.slice(0, 18)}${Math.random().toString(36).slice(2, 6)}`;
    if (await findAccount(username)) continue;
    try {
      const account = await createAccount(username, await hashPassword(newToken()), meta, {
        passwordSet: false,
      });
      await setFirebaseUid(pool, account.id, identity.uid);
      return account.id;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new Error('could not allocate a username for a new Firebase account');
}

interface FirebaseLoginBody {
  idToken?: unknown;
}

async function firebaseLoginHandler(ctx: Ctx): Promise<void> {
  if (!rateLimited(ctx.req).allowed) {
    json(ctx.res, 429, {
      error: 'too many attempts, wait a minute and try again',
      code: 'auth.too_many_attempts',
    });
    return;
  }
  const body = (ctx.body ?? {}) as FirebaseLoginBody;
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  const identity = await verifyFirebaseIdToken(idToken);
  if (!identity) {
    json(ctx.res, 401, { error: 'invalid Firebase token', code: 'firebaseAuth.invalid_token' });
    return;
  }

  let accountId = await accountForFirebaseUid(pool, identity.uid);
  if (accountId === null) {
    accountId = await matchByProviderSubject(identity.uid);
    if (accountId !== null) await setFirebaseUid(pool, accountId, identity.uid);
  }
  if (accountId === null) {
    accountId = await provisionFreshAccount(identity, ctx.req);
  }

  const status = await moderationStatusForAccount(accountId);
  if (status.locked) {
    json(ctx.res, 403, moderationErrorBody(status));
    return;
  }
  json(ctx.res, 200, await issueFirebaseSession(accountId, ctx.req));
}

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/auth/firebase',
    surface: 'api',
    middleware: [withBody()],
    handler: firebaseLoginHandler,
  },
];
```

- [ ] **Step 2: Register the route**

In `server/http/registry.ts`, add the import above the `// new:endpoint imports appear above this line` anchor:

```typescript
import { routes as firebaseAuthRoutes } from '../firebase_auth';
```

And add the spread above the `// new:endpoint spreads appear above this line` anchor:

```typescript
  ...firebaseAuthRoutes,
```

- [ ] **Step 3: Run tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Format and commit**

```bash
npx @biomejs/biome check --write server/firebase_auth.ts server/http/registry.ts
git add server/firebase_auth.ts server/http/registry.ts
git commit -m "feat(auth): add the Firebase Auth token-resolution route"
```

---

### Task 5: Background Firebase provisioning on the existing password login

**Files:**
- Modify: `server/auth_routes.ts`
- Test: `tests/server/auth.login.test.ts`

This is the email/password half of the migration, and it needs NO client change: the existing `#login-panel` form keeps calling `api.login(username, password, ...)` against the unchanged `/api/login` endpoint. The only addition is a best-effort side effect after a successful legacy login.

- [ ] **Step 1: Write the failing test**

Add to `tests/server/auth.login.test.ts`, inside (or near) the existing `describe('login: success', ...)` block; check that block's existing fake-account setup pattern first (it already builds a fake account row with `correctHash` per the file's `beforeAll`) and reuse it:

```typescript
describe('login: background Firebase provisioning', () => {
  afterEach(() => {
    resetAuthDbForTests();
    resetRateLimits();
  });

  it('provisions a Firebase user when the account has an email and no firebase_uid yet', async () => {
    const provisionFirebaseShadow = vi.fn().mockResolvedValue(undefined);
    setAuthDbForTests({
      findAccount: async () => ({
        id: 1,
        username: USERNAME,
        password_hash: correctHash,
        email: 'hero@example.com',
        firebase_uid: null,
      }),
      moderationStatusForAccount: async () => ({ locked: false }) as never,
      saveToken: async () => {},
      touchLogin: async () => {},
      provisionFirebaseShadow,
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: LOGIN_PATH,
      body: { username: USERNAME, password: CORRECT_PASSWORD },
    });
    await routes.find((r) => r.path === LOGIN_PATH)?.handler(ctx);
    expect(provisionFirebaseShadow).toHaveBeenCalledWith('hero@example.com', CORRECT_PASSWORD, 1);
  });

  it('skips provisioning for an account with no email on file', async () => {
    const provisionFirebaseShadow = vi.fn().mockResolvedValue(undefined);
    setAuthDbForTests({
      findAccount: async () => ({
        id: 1,
        username: USERNAME,
        password_hash: correctHash,
        email: null,
        firebase_uid: null,
      }),
      moderationStatusForAccount: async () => ({ locked: false }) as never,
      saveToken: async () => {},
      touchLogin: async () => {},
      provisionFirebaseShadow,
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: LOGIN_PATH,
      body: { username: USERNAME, password: CORRECT_PASSWORD },
    });
    await routes.find((r) => r.path === LOGIN_PATH)?.handler(ctx);
    expect(provisionFirebaseShadow).not.toHaveBeenCalled();
  });

  it('skips provisioning for an account that already has a firebase_uid', async () => {
    const provisionFirebaseShadow = vi.fn().mockResolvedValue(undefined);
    setAuthDbForTests({
      findAccount: async () => ({
        id: 1,
        username: USERNAME,
        password_hash: correctHash,
        email: 'hero@example.com',
        firebase_uid: 'already-migrated',
      }),
      moderationStatusForAccount: async () => ({ locked: false }) as never,
      saveToken: async () => {},
      touchLogin: async () => {},
      provisionFirebaseShadow,
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: LOGIN_PATH,
      body: { username: USERNAME, password: CORRECT_PASSWORD },
    });
    await routes.find((r) => r.path === LOGIN_PATH)?.handler(ctx);
    expect(provisionFirebaseShadow).not.toHaveBeenCalled();
  });

  it('still logs the player in even when Firebase provisioning throws', async () => {
    setAuthDbForTests({
      findAccount: async () => ({
        id: 1,
        username: USERNAME,
        password_hash: correctHash,
        email: 'hero@example.com',
        firebase_uid: null,
      }),
      moderationStatusForAccount: async () => ({ locked: false }) as never,
      saveToken: async () => {},
      touchLogin: async () => {},
      provisionFirebaseShadow: async () => {
        throw new Error('Firebase is down');
      },
    });
    const ctx = fakeCtx({
      method: 'POST',
      url: LOGIN_PATH,
      body: { username: USERNAME, password: CORRECT_PASSWORD },
    });
    await routes.find((r) => r.path === LOGIN_PATH)?.handler(ctx);
    const res = ctx.res as unknown as FakeRes;
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/auth.login.test.ts`
Expected: FAIL, `provisionFirebaseShadow` is not a recognized key on `setAuthDbForTests`'s overrides type, and `loginHandler` never calls it.

- [ ] **Step 3: Add `provisionFirebaseShadow` to the db seam**

In `server/db.ts`, add a function that wraps the two migration steps together (so `auth_routes.ts` calls one thing, and the whole side effect is fakeable as one unit in tests):

```typescript
/** Best-effort background migration: provisions (or updates) a Firebase user with
 *  the just-verified legacy password, then links it. Callers MUST treat this as
 *  fire-and-forget-safe (catch and ignore any rejection): a Firebase outage must
 *  never block a legacy login. */
export async function provisionFirebaseShadow(
  email: string,
  password: string,
  accountId: number,
): Promise<void> {
  const { createFirebaseUserWithPassword } = await import('./firebase_admin');
  const firebaseUid = await createFirebaseUserWithPassword(email, password);
  await setFirebaseUid(pool, accountId, firebaseUid);
}
```

(The dynamic `import('./firebase_admin')` avoids a static import cycle risk between `db.ts` and `firebase_admin.ts`: `firebase_admin.ts` does not import `db.ts`, so this is precautionary rather than strictly required, but it also means `db.ts`'s existing test suites never need to mock `firebase-admin` just because they import `db.ts`.)

- [ ] **Step 4: Wire it into `loginHandler`**

In `server/auth_routes.ts`, add `provisionFirebaseShadow` to the `REAL_AUTH_DB` bundle's imports and object literal (alongside `findAccount`, `saveToken`, etc.). Then, in `loginHandler`, immediately after `clearAuthFailures(username);` and before `await authDb.touchLogin(...)`, add:

```typescript
  clearAuthFailures(username); // correct password: forgive earlier typos
  if (account.email?.trim() && !account.firebase_uid) {
    // Best-effort: never let a Firebase hiccup block a legacy login.
    void authDb
      .provisionFirebaseShadow(account.email, String(body.password ?? ''), account.id)
      .catch(() => {});
  }
  await authDb.touchLogin(account.id, rt.requestMetadata(ctx.req));
```

Note this is a fire-and-forget `void` call (not awaited): the test in Step 1 above still observes it via the mock being CALLED (vitest records the call synchronously even though the promise resolves later), and the "still logs the player in even when Firebase provisioning throws" test proves the `.catch(() => {})` makes a rejection harmless. If the test run in Step 5 below shows the fire-and-forget call is not reliably observed before the test's assertion runs (a real risk with `void` plus unawaited mocks in some test setups), switch to `await ... .catch(() => {})` instead: awaited but still failure-safe, at the cost of adding the Firebase round-trip to the login request's latency. Prefer starting with `await` for test determinism unless login latency is measured and found to matter.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/server/auth.login.test.ts`
Expected: all tests pass, including the 4 new ones and every pre-existing one in the file (a regression here would mean the new step broke an unrelated login branch).

- [ ] **Step 6: Run tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Format and commit**

```bash
npx @biomejs/biome check --write server/db.ts server/auth_routes.ts tests/server/auth.login.test.ts
git add server/db.ts server/auth_routes.ts tests/server/auth.login.test.ts
git commit -m "feat(auth): silently provision a Firebase identity on legacy password login"
```

---

### Task 6: Route-level tests for `server/firebase_auth.ts`

**Files:**
- Create: `tests/server/firebase_auth.test.ts`

Follow `tests/apple_auth.test.ts`'s style: mock `server/firebase_admin` (never real Firebase), mock the `_db` modules the route reads, and drive the handler directly via `routes[0].handler(ctx)` using `fakeCtx` from `tests/server/helpers`. Every scenario below is provider-agnostic at the server layer by design: Google, Discord, and Apple all arrive as the same shape (a verified `{uid, email, emailVerified}`) once Firebase's client SDK has done its job, so a single "fresh signup" and a single "already migrated" test cover all three providers' server-side behavior; Discord and Apple each get their OWN test only for the one thing that differs between them (which linking table they match against).

- [ ] **Step 1: Write the test file**

```typescript
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_firebase_auth_test';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeCtx } from './helpers';

vi.mock('../../server/firebase_admin', () => ({
  verifyFirebaseIdToken: vi.fn(),
}));
vi.mock('../../server/db', async () => {
  const actual = await vi.importActual<typeof import('../../server/db')>('../../server/db');
  return {
    ...actual,
    pool: {},
    accountForFirebaseUid: vi.fn(),
    setFirebaseUid: vi.fn(),
    saveToken: vi.fn().mockResolvedValue(undefined),
    touchLogin: vi.fn().mockResolvedValue(undefined),
    accountById: vi.fn().mockResolvedValue({ username: 'testuser', email: 'player@example.com' }),
    moderationStatusForAccount: vi.fn().mockResolvedValue({ locked: false }),
    createAccount: vi.fn(),
  };
});
vi.mock('../../server/discord_db', () => ({ accountForDiscord: vi.fn() }));
vi.mock('../../server/apple_auth_db', () => ({ accountForApple: vi.fn() }));
vi.mock('../../server/auth', async () => {
  const actual = await vi.importActual<typeof import('../../server/auth')>('../../server/auth');
  return { ...actual, findAccount: vi.fn() };
});

import { accountForApple } from '../../server/apple_auth_db';
import { findAccount } from '../../server/auth';
import { accountForFirebaseUid, createAccount, setFirebaseUid } from '../../server/db';
import { accountForDiscord } from '../../server/discord_db';
import { verifyFirebaseIdToken } from '../../server/firebase_admin';
import { routes } from '../../server/firebase_auth';

interface FakeResShape {
  statusCode: number;
  body: string;
}
function captured(res: { statusCode: number; body: string }) {
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/auth/firebase', () => {
  it('401s an invalid token before touching the database', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue(null);
    const ctx = fakeCtx({ method: 'POST', url: '/api/auth/firebase', body: { idToken: 'bad' } });
    await routes[0].handler(ctx);
    const { status, body } = captured(ctx.res as unknown as FakeResShape);
    expect(status).toBe(401);
    expect(body).toMatchObject({ code: 'firebaseAuth.invalid_token' });
    expect(accountForFirebaseUid).not.toHaveBeenCalled();
  });

  it('logs an already-migrated account straight through, no matching path touched, and returns the session shape', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({
      uid: 'uid-1',
      email: 'player@example.com',
      emailVerified: true,
    });
    vi.mocked(accountForFirebaseUid).mockResolvedValue(99);
    const ctx = fakeCtx({ method: 'POST', url: '/api/auth/firebase', body: { idToken: 'good' } });
    await routes[0].handler(ctx);
    const { status, body } = captured(ctx.res as unknown as FakeResShape);
    expect(status).toBe(200);
    expect(body).toEqual({ token: expect.any(String), username: 'testuser', emailMissing: false });
    expect(accountForDiscord).not.toHaveBeenCalled();
    expect(accountForApple).not.toHaveBeenCalled();
  });

  it('migrates an existing Discord-linked account by matching the provider subject (works identically for a Google- or Discord-issued token)', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({
      uid: 'discord-user-42',
      email: 'player@example.com',
      emailVerified: true,
    });
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(accountForDiscord).mockResolvedValue(55);
    vi.mocked(accountForApple).mockResolvedValue(null);
    const ctx = fakeCtx({ method: 'POST', url: '/api/auth/firebase', body: { idToken: 'good' } });
    await routes[0].handler(ctx);
    expect(captured(ctx.res as unknown as FakeResShape).status).toBe(200);
    expect(setFirebaseUid).toHaveBeenCalledWith(expect.anything(), 55, 'discord-user-42');
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('migrates an existing Apple-linked account by matching the provider subject', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({
      uid: 'apple-subject-7',
      email: 'player@example.com',
      emailVerified: true,
    });
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(accountForDiscord).mockResolvedValue(null);
    vi.mocked(accountForApple).mockResolvedValue(66);
    const ctx = fakeCtx({ method: 'POST', url: '/api/auth/firebase', body: { idToken: 'good' } });
    await routes[0].handler(ctx);
    expect(captured(ctx.res as unknown as FakeResShape).status).toBe(200);
    expect(setFirebaseUid).toHaveBeenCalledWith(expect.anything(), 66, 'apple-subject-7');
  });

  it('provisions a brand new account when nothing matches at all (the fresh-signup path every provider shares)', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({
      uid: 'fresh-uid',
      email: 'newplayer@example.com',
      emailVerified: true,
    });
    vi.mocked(accountForFirebaseUid).mockResolvedValue(null);
    vi.mocked(accountForDiscord).mockResolvedValue(null);
    vi.mocked(accountForApple).mockResolvedValue(null);
    vi.mocked(findAccount).mockResolvedValue(null);
    vi.mocked(createAccount).mockResolvedValue({ id: 123 } as never);
    const ctx = fakeCtx({ method: 'POST', url: '/api/auth/firebase', body: { idToken: 'good' } });
    await routes[0].handler(ctx);
    expect(captured(ctx.res as unknown as FakeResShape).status).toBe(200);
    expect(createAccount).toHaveBeenCalled();
    expect(setFirebaseUid).toHaveBeenCalledWith(expect.anything(), 123, 'fresh-uid');
  });

  it('403s a locked (banned/suspended) account after resolution, before issuing a session', async () => {
    vi.mocked(verifyFirebaseIdToken).mockResolvedValue({
      uid: 'uid-1',
      email: 'player@example.com',
      emailVerified: true,
    });
    vi.mocked(accountForFirebaseUid).mockResolvedValue(99);
    const { moderationStatusForAccount } = await import('../../server/db');
    vi.mocked(moderationStatusForAccount).mockResolvedValue({
      locked: true,
      banned: true,
      reason: 'banned',
      message: 'This account has been banned.',
    } as never);
    const ctx = fakeCtx({ method: 'POST', url: '/api/auth/firebase', body: { idToken: 'good' } });
    await routes[0].handler(ctx);
    expect(captured(ctx.res as unknown as FakeResShape).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests, fix until green**

Run: `npx vitest run tests/server/firebase_auth.test.ts`
Expected: 6 tests pass. If `fakeCtx`'s shape doesn't line up with `ctx.res` casting used above, check `tests/server/helpers/index.ts` for the exact `FakeRes` field names and adjust the `captured()` helper to match.

- [ ] **Step 3: Format and commit**

```bash
npx @biomejs/biome check --write tests/server/firebase_auth.test.ts
git add tests/server/firebase_auth.test.ts
git commit -m "test(auth): cover the Firebase Auth token-resolution route"
```

---

### Task 7: Client Firebase SDK wrapper

**Files:**
- Create: `src/net/firebase_client.ts`
- Test: `tests/firebase_client.test.ts`
- Modify: `package.json` (add `firebase`)

- [ ] **Step 1: Add the dependency**

```bash
npm install firebase
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';

const signInWithPopup = vi.fn();
const getIdToken = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithPopup,
  GoogleAuthProvider: vi.fn(() => ({})),
  OAuthProvider: vi.fn((providerId: string) => ({ providerId })),
}));

describe('src/net/firebase_client', () => {
  it('signInWithGoogle returns the ID token from the popup result', async () => {
    signInWithPopup.mockResolvedValue({ user: { getIdToken } });
    getIdToken.mockResolvedValue('google-id-token');
    const { signInWithGoogle } = await import('./firebase_client');
    await expect(signInWithGoogle()).resolves.toBe('google-id-token');
  });

  it('signInWithDiscord returns the ID token from the custom OIDC popup result', async () => {
    signInWithPopup.mockResolvedValue({ user: { getIdToken } });
    getIdToken.mockResolvedValue('discord-id-token');
    const { signInWithDiscord } = await import('./firebase_client');
    await expect(signInWithDiscord()).resolves.toBe('discord-id-token');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/firebase_client.test.ts`
Expected: FAIL, `src/net/firebase_client` does not exist.

- [ ] **Step 4: Write the implementation**

```typescript
// src/net/firebase_client.ts
//
// The client-side Firebase JS SDK wrapper: init plus one function per sign-in
// method this plan wires up (Google, Discord), each returning a Firebase ID token
// for Api.firebaseLogin (online.ts). Deliberately carries NO email/password
// function: the existing username/password login form never talks to Firebase
// client-side (see the design spec and this plan's Scope note for why). No
// account/session concepts here; this module only knows how to talk to Firebase,
// never to this game's own server.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';

// Firebase's client-side config is not a secret: Firebase's security model puts
// enforcement on server-side token verification (server/firebase_admin.ts), not on
// hiding these values (design spec Section 9). Fill in the real project values
// before shipping; these are placeholders for the Firebase console project this
// migration is provisioned against.
const FIREBASE_CONFIG = {
  apiKey: 'REPLACE_WITH_REAL_API_KEY',
  authDomain: 'REPLACE_WITH_REAL_AUTH_DOMAIN',
  projectId: 'REPLACE_WITH_REAL_PROJECT_ID',
};

let app: ReturnType<typeof initializeApp> | null = null;
function firebaseApp() {
  if (!app) app = initializeApp(FIREBASE_CONFIG);
  return app;
}

export async function signInWithGoogle(): Promise<string> {
  const credential = await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider());
  return credential.user.getIdToken();
}

// Discord has no Firebase built-in provider; this is Firebase's generic OIDC
// provider pointed at a Discord OIDC app, configured in the Firebase console (an
// operational step, not code) under this exact provider id.
export async function signInWithDiscord(): Promise<string> {
  const credential = await signInWithPopup(getAuth(firebaseApp()), new OAuthProvider('oidc.discord'));
  return credential.user.getIdToken();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/firebase_client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Format and commit**

```bash
npx @biomejs/biome check --write src/net/firebase_client.ts tests/firebase_client.test.ts package.json
git add src/net/firebase_client.ts tests/firebase_client.test.ts package.json package-lock.json
git commit -m "feat(auth): add the client-side Firebase SDK wrapper (Google, Discord)"
```

**Note for whoever deploys this:** `FIREBASE_CONFIG` in the file above carries placeholder values. Before this ships to any real environment, replace them with the real Firebase project's config (from the Firebase console, Project Settings > General > Your apps), and configure the Discord OIDC provider (console: Authentication > Sign-in method > Add new provider > OpenID Connect, provider ID `oidc.discord`) using Discord's actual `.well-known/openid-configuration` endpoint and a Discord application's client id/secret, an operational task with no code component.

---

### Task 8: `Api.firebaseLogin` in the client's REST layer

**Files:**
- Modify: `src/net/online.ts`

- [ ] **Step 1: Add the method**

In `src/net/online.ts`, immediately after the existing `login()` method (the one calling `this.post('/api/login', ...)`), add:

```typescript
  // Mirrors appleLogin's shape: post the Firebase ID token, get back the same
  // session shape every other login path produces. Used by the Google and Discord
  // sign-in buttons (see firebase_client.ts); the password form never calls this.
  async firebaseLogin(idToken: string): Promise<void> {
    const data = await this.post('/api/auth/firebase', { idToken });
    this.token = data.token;
    this.username = data.username;
    this.emailMissing = data.emailMissing === true;
  }
```

- [ ] **Step 2: Run tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Format and commit**

```bash
npx @biomejs/biome check --write src/net/online.ts
git add src/net/online.ts
git commit -m "feat(auth): add Api.firebaseLogin"
```

---

### Task 9: Wire the Google and Discord web login buttons through Firebase

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/ui/i18n.catalog/hud.ts`

The password form (`doAuth`, `#login-panel`) is untouched by this task; see this plan's Scope note and Task 5.

- [ ] **Step 1: Add the Google button markup**

In `index.html`, find the `#btn-login-discord` button (search for `id="btn-login-discord"`). Add a new button immediately after it, matching its exact attribute shape (hidden by default, same class):

```html
<button type="button" id="btn-login-google" class="auth-provider-btn" hidden data-i18n="hudChrome.auth.googleLoginCta" aria-label="Continue with Google">Continue with Google</button>
```

Confirm the exact class name by reading the real `#btn-login-discord` element first (the snippet above assumes `class="auth-provider-btn"`; use whatever the real element actually carries instead if it differs).

- [ ] **Step 2: Add the new i18n key**

In `src/ui/i18n.catalog/hud.ts`, find the `auth` namespace block (containing the existing `appleLoginCta` key, per `src/main.ts:8579`'s `'hudChrome.auth.appleLoginCta'` reference) and add, English only, per this repo's i18n contributor rule:

```typescript
    googleLoginCta: 'Continue with Google',
```

- [ ] **Step 3: Wire the Google button**

In `src/main.ts`, near the existing `discordLoginBtn` wiring (the `const discordLoginBtn = $('#btn-login-discord')` block, around line 8494), add immediately after it:

```typescript
  const googleLoginBtn = $('#btn-login-google');
  if (googleLoginBtn) {
    googleLoginBtn.hidden = false;
    googleLoginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      googleLoginBtn.setAttribute('disabled', 'true');
      try {
        const { signInWithGoogle } = await import('../net/firebase_client');
        const idToken = await signInWithGoogle();
        await api.firebaseLogin(idToken);
        api.saveSession();
        enterLoggedInChrome();
      } catch (err) {
        loginError(userFacingApiError(err));
      } finally {
        googleLoginBtn.removeAttribute('disabled');
      }
    });
  }
```

Confirm `userFacingApiError`, `enterLoggedInChrome`, and `loginError` are already in scope at this point in `main.ts` before assuming this compiles as written: they are used by the adjacent existing Apple-login handler a few lines up (`src/main.ts:8468-8491`), so they should already be in scope, but verify rather than assume.

- [ ] **Step 4: Repoint the Discord button**

Find the existing `discordLoginBtn.addEventListener('click', ...)` block (the one calling `startDiscordOAuth('login')`, around line 8499) and replace its body with the Firebase equivalent, keeping the existing desktop-bridge branch untouched (the desktop shell's off-origin redirect constraint applies just the same to Firebase's popup-based flow, so the bridge branch stays first):

```typescript
    discordLoginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const bridge = DESKTOP_APP ? desktopBridge() : null;
      if (bridge) {
        void bridge.openBrowserLogin();
        return;
      }
      discordLoginBtn.setAttribute('disabled', 'true');
      try {
        const { signInWithDiscord } = await import('../net/firebase_client');
        const idToken = await signInWithDiscord();
        await api.firebaseLogin(idToken);
        api.saveSession();
        enterLoggedInChrome();
      } catch (err) {
        loginError(userFacingApiError(err));
      } finally {
        discordLoginBtn.removeAttribute('disabled');
      }
    });
```

This removes the call to `startDiscordOAuth('login')`. Check whether `startDiscordOAuth` (and the first-time "create new or link existing" chooser flow built around `pendingDiscordChoice`, further down in the same file) is used by ANY other call site before deleting it outright. The chooser flow exists because the OLD Discord OAuth redirect could reach a Discord identity with no linked account yet, which Firebase's `matchByProviderSubject` (Task 4) now resolves server-side without a chooser step (a brand-new Discord sign-in just provisions a fresh account directly, same as any other provider). If `startDiscordOAuth` and the chooser UI have no other caller after this change, removing them is real cleanup this task should do in the same commit, not a separate follow-up: leaving unreachable OAuth-handshake code behind after repointing its one caller is exactly the kind of dead code this repo's conventions call out to avoid. Confirm with `grep -rn "startDiscordOAuth\|pendingDiscordChoice" src/` before deciding.

- [ ] **Step 5: Run tsc and the existing client-shell tests**

Run: `npx tsc --noEmit && npx vitest run tests/client_shell.test.ts`
Expected: clean; `tests/client_shell.test.ts` may need new/updated assertions for the added `#btn-login-google` markup, following the pattern of its existing `#btn-login-discord` assertions (grep the file for `btn-login-discord` to find every assertion needing a Google-flavored sibling).

- [ ] **Step 6: Format and commit**

```bash
npx @biomejs/biome check --write index.html src/main.ts src/ui/i18n.catalog/hud.ts
git add index.html src/main.ts src/ui/i18n.catalog/hud.ts tests/client_shell.test.ts
git commit -m "feat(auth): wire the web Google and Discord login buttons through Firebase"
```

---

### Task 10: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full targeted test run**

Run: `npx vitest run tests/firebase_auth_db.test.ts tests/firebase_admin.test.ts tests/firebase_client.test.ts tests/server/firebase_auth.test.ts tests/server/auth.login.test.ts tests/server/http/error_codes.test.ts tests/api_error_code_parity.test.ts tests/client_shell.test.ts tests/architecture.test.ts tests/localization_fixes.test.ts`
Expected: all green.

- [ ] **Step 3: The full gate**

Run: `npm run gate`
Expected: green. This is the same CI-equivalent gate every other change in this repo goes through before being called done; it also re-runs the i18n freshness check and the malware scan, both worth a clean pass on a change that touches auth and adds two new external dependencies.

- [ ] **Step 4: Manual verification in the running game**

Per this repo's default workflow, a login/auth change needs an actual browser pass, not just unit tests: `npm run dev` plus `npm run server` (with `FIREBASE_SERVICE_ACCOUNT_JSON` and a real Firebase project's `FIREBASE_CONFIG` values in place, per Task 7's deployment note), then manually exercise:

- A fresh signup via Google.
- A fresh signup via Discord (confirm no "create new or link existing" chooser appears, since Task 9's server-side resolution no longer needs one).
- An existing Discord-linked account's first post-cutover login (confirm it resolves automatically via the provider-subject match, not a fresh account).
- An existing password account logging in normally (confirm the UX is completely unchanged), then confirm in Postgres (`SELECT firebase_uid FROM accounts WHERE username = '<that account>'`) that it now carries a `firebase_uid` after that one login.
- The same password account logging in a SECOND time (confirm it still works identically; the account already has a `firebase_uid`, so Task 5's background step should no-op this time, per the "skips provisioning for an account that already has a firebase_uid" test).

Record the outcome; this cannot be meaningfully faked by a unit test given the real external dependency on Firebase.

---

## Completion definition

This plan is complete when:

- All 10 tasks are committed, each task's own tests green at the time of its commit.
- `npm run gate` passes on the final state.
- The five manual verification scenarios in Task 10 Step 4 have been run against a real (test-mode) Firebase project and confirmed working.
- No em dash, en dash, or emoji appears in any new or modified file (this repo's hard, always-on rule).

## Follow-on work (not part of this plan)

- Native-app (Capacitor iOS/Android) Apple and Discord sign-in through Firebase: a materially different mechanism (native SDKs, `native_attestation.ts`, the desktop/native login-code handoff flows), explicitly out of scope here (see this plan's Scope note).
- A real UX decision on whether password login should ever move to an email-based identifier (which would let Firebase become the actual verification authority for password accounts, not just a mirrored identity): deliberately not decided in this plan; see this plan's Scope note and the design spec.
- Retiring the legacy `/api/register`/Discord-OAuth-redirect/`/api/auth/apple` endpoints and the background-provisioning step, once migration telemetry shows it: design spec Section 10.
- Firestore, or any further migration of game data off Postgres (design spec, explicitly deferred to its own future spec).
