// POST /api/login for the endless-glory.vercel.app auth-only backend (api/CLAUDE.md).
// Minimal subset of server/auth_routes.ts's loginHandler: username + password only, no
// per-account throttle, TOTP, or moderation lock (none of that state exists in this
// small accounts table). Reuses the pure helpers from server/auth.ts verbatim.
import { newToken, verifyPassword } from '../server/auth';
import { findAccountByUsername, saveToken, touchLogin } from './_lib/db';
import { bodyOf, type FnRequest, type FnResponse, jsonError, methodNotAllowed } from './_lib/http';

export default async function handler(req: FnRequest, res: FnResponse): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const body = bodyOf(req);
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const account = username ? await findAccountByUsername(username) : null;
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    jsonError(res, 401, 'Invalid username or password.', 'auth.invalid_credentials');
    return;
  }

  await touchLogin(account.id);
  const token = newToken();
  await saveToken(token, account.id);
  const emailMissing = !account.email?.trim();
  res.status(200).json({ token, username: account.username, emailMissing });
}
