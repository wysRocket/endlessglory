// POST /api/auth/firebase for the endless-glory.vercel.app auth-only backend
// (api/CLAUDE.md). Minimal subset of server/firebase_auth.ts's firebaseLoginHandler:
// resolves a verified Firebase ID token straight to an accounts row by firebase_uid,
// provisioning a fresh account on first sign-in. No Discord/Apple provider-subject
// matching and no moderation lock (neither exists in this small accounts table).
import { randomBytes } from 'node:crypto';
import { hashPassword, newToken, offensiveName } from '../../../server/auth.js';
import { verifyFirebaseIdToken } from '../../../server/firebase_admin.js';
import { accountForFirebaseUid, createAccount, saveToken } from '../_lib/db.js';
import {
  bodyOf,
  type FnRequest,
  type FnResponse,
  jsonError,
  methodNotAllowed,
} from '../_lib/http.js';

// The username a fresh Firebase signup starts with: the email local part, kept to a
// valid username shape, falling back to a random name when too short or offensive
// (mirrors server/firebase_auth.ts's usernameBase).
function usernameBase(email: string | null): string {
  const value = (email?.split('@')[0] ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 18);
  if (value.length < 3 || offensiveName(value)) return `player${randomBytes(3).toString('hex')}`;
  return value;
}

async function provisionFreshAccount(email: string | null, firebaseUid: string) {
  const base = usernameBase(email);
  for (let attempt = 0; attempt < 8; attempt++) {
    const username = attempt === 0 ? base : `${base.slice(0, 18)}${randomBytes(2).toString('hex')}`;
    try {
      return await createAccount(username, await hashPassword(newToken()), email, firebaseUid);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') continue;
      throw err;
    }
  }
  return createAccount(
    `player${randomBytes(8).toString('hex').slice(0, 18)}`,
    await hashPassword(newToken()),
    email,
    firebaseUid,
  );
}

export default async function handler(req: FnRequest, res: FnResponse): Promise<void> {
  if (req.method !== 'POST') return methodNotAllowed(res);
  const body = bodyOf(req);
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';

  const identity = await verifyFirebaseIdToken(idToken);
  if (!identity) {
    jsonError(
      res,
      401,
      'That sign-in could not be verified. Please sign in again.',
      'firebase_auth.invalid_token',
    );
    return;
  }

  let account = await accountForFirebaseUid(identity.uid);
  if (!account) {
    const email = identity.email && identity.emailVerified ? identity.email : null;
    account = await provisionFreshAccount(email, identity.uid);
  }

  const token = newToken();
  await saveToken(token, account.id);
  res.status(200).json({
    token,
    username: account.username,
    emailMissing: !account.email?.trim(),
  });
}
