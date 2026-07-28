// The Firebase Auth token-resolution surface for Google/Discord/Apple sign-in
// (design spec: docs/superpowers/specs/2026-07-22-firebase-auth-design.md). One
// route, POST /api/auth/firebase: verify the client's Firebase ID token, then
// resolve it to an accounts row by (in order) an already-linked firebase_uid, a
// matching discord_links/apple_auth_links provider subject id, or, with no match at
// all, a fresh signup. Password-account migration is a SEPARATE, background step on
// the existing /api/login path (server/auth_routes.ts): this route is never reached
// by the password login form.
//
// It follows server/apple_auth.ts's shape: an unauthenticated, rate-limited RouteDef
// (a login endpoint cannot be gated by the bearer-auth guard, since the caller has no
// session yet) with a session-issuing helper mirroring issueAppleSession, writing the
// same legacy body shapes through the same http_util json() helper.
//
// Server-authority + language-agnostic: every outcome is decided here and the client
// re-localizes the stable code (no t(), no DOM).
//
// Anti-bot note: this route deliberately carries no Turnstile gate, unlike
// /api/register and /api/login. The request must already carry a Google-signed
// Firebase ID token, which cannot be produced without completing a real provider
// sign-in, a strictly stronger bot gate than a Turnstile widget token. The IP rate
// limit still bounds signup volume.

import { randomBytes } from 'node:crypto';
import type * as http from 'node:http';
import { accountForApple } from './apple_auth_db';
import { hashPassword, newToken, offensiveName } from './auth';
import {
  accountById,
  accountForFirebaseUid,
  backfillAccountEmailIfEmpty,
  createAccount,
  findAccount,
  moderationStatusForAccount,
  pool,
  saveToken,
  setFirebaseUid,
  touchLogin,
} from './db';
import { accountForDiscord } from './discord_db';
import { type VerifiedFirebaseIdentity, verifyFirebaseIdToken } from './firebase_admin';
import { withBody } from './http/middleware/body';
import type { Ctx, Middleware, RouteDef } from './http/types';
import { isUniqueViolation, json, moderationErrorBody } from './http_util';
import { rateLimited, requestIp } from './ratelimit';
import { isWebClientRequest, webLoginEnforced } from './web_login_guard';

/**
 * Firebase's provider id for the Discord OIDC provider. Discord is not one of
 * Firebase's built-in providers, so its id is whatever the console operator named
 * the OIDC provider ('oidc.' + name); the env var lets a differently-named provider
 * be pointed at without a code change.
 */
const DISCORD_PROVIDER_ID = process.env.FIREBASE_DISCORD_PROVIDER_ID?.trim() || 'oidc.discord';
/** Apple's built-in Firebase provider id, whose subject is the same `sub` that
 *  apple_auth_links.apple_subject already stores. */
const APPLE_PROVIDER_ID = 'apple.com';

const WEB_LOGIN_ONLY = 'logins are only allowed from the game client';
const TOO_MANY_ATTEMPTS = 'too many attempts, wait a minute and try again';

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

/**
 * Provider-linked migration match: a Discord or Apple subject already recorded in
 * discord_links/apple_auth_links resolves straight to its existing account (design
 * spec Section 6, first bullet), so a returning player keeps their characters.
 *
 * Each provider is looked up ONLY against its own table. Matching every subject id
 * against every table would be an account-takeover vector: a Google `sub` and a
 * Discord snowflake are both opaque numeric strings, so a cross-provider match could
 * hand one provider's user another provider's account.
 */
export async function matchByProviderSubject(
  identity: VerifiedFirebaseIdentity,
): Promise<number | null> {
  for (const subject of identity.providerSubjects[DISCORD_PROVIDER_ID] ?? []) {
    const accountId = await accountForDiscord(pool, subject);
    if (accountId !== null) return accountId;
  }
  for (const subject of identity.providerSubjects[APPLE_PROVIDER_ID] ?? []) {
    const accountId = await accountForApple(pool, subject);
    if (accountId !== null) return accountId;
  }
  return null;
}

/** The username a fresh Firebase signup starts with: the email local part, kept to
 *  the shape validUsernameShape accepts, falling back to a random name when it is
 *  too short or offensive (mirrors apple_auth.ts usernameBase). */
function usernameBase(email: string | null): string {
  const value = (email?.split('@')[0] ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 18);
  if (value.length < 3 || offensiveName(value)) return `player${randomBytes(3).toString('hex')}`;
  return value;
}

async function provisionFreshAccount(
  identity: VerifiedFirebaseIdentity,
  req: http.IncomingMessage,
): Promise<number> {
  const base = usernameBase(identity.email);
  const meta = { ip: requestIp(req), userAgent: String(req.headers['user-agent'] ?? '') };
  for (let attempt = 0; attempt < 8; attempt++) {
    const username = attempt === 0 ? base : `${base.slice(0, 18)}${randomBytes(2).toString('hex')}`;
    if (await findAccount(username)) continue;
    try {
      // passwordSet:false: the placeholder password is one the owner never chose, so
      // the account is flagged the same way a Discord-provisioned one is.
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
  const fallback = await createAccount(
    `player${randomBytes(8).toString('hex').slice(0, 18)}`,
    await hashPassword(newToken()),
    meta,
    { passwordSet: false },
  );
  await setFirebaseUid(pool, fallback.id, identity.uid);
  return fallback.id;
}

const webLoginGuard: Middleware = async (ctx, next) => {
  if (webLoginEnforced() && !isWebClientRequest(ctx.req)) {
    json(ctx.res, 403, { error: WEB_LOGIN_ONLY, code: 'auth.web_login_only' });
    return;
  }
  await next();
};

const ipRateLimitGuard: Middleware = async (ctx, next) => {
  if (!rateLimited(ctx.req).allowed) {
    json(ctx.res, 429, { error: TOO_MANY_ATTEMPTS, code: 'auth.too_many_attempts' });
    return;
  }
  await next();
};

export async function firebaseLoginHandler(ctx: Ctx): Promise<void> {
  const body = (ctx.body ?? {}) as { idToken?: unknown };
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  const identity = await verifyFirebaseIdToken(idToken);
  if (!identity) {
    json(ctx.res, 401, { error: 'invalid Firebase token', code: 'firebase_auth.invalid_token' });
    return;
  }

  let accountId = await accountForFirebaseUid(pool, identity.uid);
  if (accountId === null) {
    accountId = await matchByProviderSubject(identity);
    // Record the uid on the matched account so every later sign-in takes the fast
    // first branch instead of re-walking the provider tables.
    if (accountId !== null) await setFirebaseUid(pool, accountId, identity.uid);
  }
  if (accountId === null) accountId = await provisionFreshAccount(identity, ctx.req);

  const status = await moderationStatusForAccount(accountId);
  if (status.locked) {
    json(ctx.res, 403, moderationErrorBody(status));
    return;
  }
  if (identity.email && identity.emailVerified) {
    await backfillAccountEmailIfEmpty(accountId, identity.email, true);
  }
  json(ctx.res, 200, await issueFirebaseSession(accountId, ctx.req));
}

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/auth/firebase',
    surface: 'api',
    middleware: [webLoginGuard, ipRateLimitGuard, withBody()],
    handler: firebaseLoginHandler,
  },
];
