// POST /api/register for the endless-glory.vercel.app auth-only backend (api/CLAUDE.md).
// Mirrors server/auth_routes.ts's registerHandler wire contract (same request/response
// shape and error codes) so the existing game client needs no changes, but is a much
// smaller implementation: no Turnstile, no welcome email, no CAPI tracking, no native
// attestation. Reuses the pure, dependency-free helpers from server/auth.ts verbatim.
import {
  hashPassword,
  newToken,
  normalizeEmail,
  offensiveName,
  validPassword,
  validUsernameShape,
} from '../../server/auth.js';
import { createAccount, findAccountByUsername, saveToken } from './_lib/db.js';
import {
  bodyOf,
  type FnRequest,
  type FnResponse,
  jsonError,
  methodNotAllowed,
} from './_lib/http.js';

export default async function handler(req: FnRequest, res: FnResponse): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const body = bodyOf(req);

  if (!validUsernameShape(body.username)) {
    jsonError(
      res,
      400,
      'Username must be 3-24 characters and use letters, digits, or underscore.',
      'account.username_invalid',
    );
    return;
  }
  if (offensiveName(body.username)) {
    jsonError(res, 400, 'That username is not allowed.', 'account.username_not_allowed');
    return;
  }
  if (!validPassword(body.password)) {
    jsonError(res, 400, 'Password must be at least 6 characters.', 'account.password_too_short');
    return;
  }
  const email = normalizeEmail(body.email);
  if (!email) {
    jsonError(res, 400, 'Enter a valid email address.', 'email.invalid');
    return;
  }

  if (await findAccountByUsername(body.username)) {
    jsonError(res, 409, 'That username is already taken.', 'account.username_taken');
    return;
  }

  let account: Awaited<ReturnType<typeof createAccount>>;
  try {
    account = await createAccount(body.username, await hashPassword(body.password), email, null);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      jsonError(res, 409, 'That username is already taken.', 'account.username_taken');
      return;
    }
    throw err;
  }

  const token = newToken();
  await saveToken(token, account.id);
  res.status(200).json({
    token,
    username: account.username,
    emailMissing: false,
    accountId: account.id,
  });
}
