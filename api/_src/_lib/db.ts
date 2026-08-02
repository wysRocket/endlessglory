// Minimal accounts store for the endless-glory.vercel.app auth-only backend (see
// api/CLAUDE.md). Deliberately NOT server/db.ts: that pool is wired to the
// authoritative game server's DATABASE_URL and full character/world schema, while
// this one is a separate Postgres (AUTH_DATABASE_URL) holding only an accounts +
// auth_tokens pair, reached over Supabase's pooled connection (serverless-safe).
import { Pool } from 'pg';

let pool: Pool | undefined;

export function authPool(): Pool {
  if (!pool) {
    const connectionString = process.env.AUTH_DATABASE_URL;
    if (!connectionString) throw new Error('AUTH_DATABASE_URL is not set');
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export interface AuthAccountRow {
  id: number;
  username: string;
  password_hash: string;
  email: string | null;
  firebase_uid: string | null;
}

export async function findAccountByUsername(username: string): Promise<AuthAccountRow | null> {
  const res = await authPool().query(
    'SELECT id, username, password_hash, email, firebase_uid FROM accounts WHERE username = $1',
    [username],
  );
  return res.rows[0] ?? null;
}

export async function accountById(id: number): Promise<AuthAccountRow | null> {
  const res = await authPool().query(
    'SELECT id, username, password_hash, email, firebase_uid FROM accounts WHERE id = $1',
    [id],
  );
  return res.rows[0] ?? null;
}

export async function accountForFirebaseUid(firebaseUid: string): Promise<AuthAccountRow | null> {
  const res = await authPool().query(
    'SELECT id, username, password_hash, email, firebase_uid FROM accounts WHERE firebase_uid = $1',
    [firebaseUid],
  );
  return res.rows[0] ?? null;
}

export async function createAccount(
  username: string,
  passwordHash: string,
  email: string | null,
  firebaseUid: string | null,
): Promise<AuthAccountRow> {
  const res = await authPool().query(
    `INSERT INTO accounts (username, password_hash, email, firebase_uid)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, password_hash, email, firebase_uid`,
    [username, passwordHash, email, firebaseUid],
  );
  return res.rows[0];
}

export async function setFirebaseUid(accountId: number, firebaseUid: string): Promise<void> {
  await authPool().query('UPDATE accounts SET firebase_uid = $1 WHERE id = $2', [
    firebaseUid,
    accountId,
  ]);
}

export async function touchLogin(accountId: number): Promise<void> {
  await authPool().query('UPDATE accounts SET last_login = now() WHERE id = $1', [accountId]);
}

const TOKEN_TTL_HOURS = 24 * 7;

export async function saveToken(token: string, accountId: number): Promise<void> {
  await authPool().query(
    `INSERT INTO auth_tokens (token, account_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
    [token, accountId, String(TOKEN_TTL_HOURS)],
  );
}
