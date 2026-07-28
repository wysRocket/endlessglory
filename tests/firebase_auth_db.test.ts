// The two `accounts.firebase_uid` query helpers, exercised against a fake pool.
// They take an explicit `pool` parameter (the `apple_auth_db.ts` convention) precisely
// so they are unit-testable without a live Postgres: the SQL text is pinned here
// because it is the contract, and a silent change to it would move which account a
// Firebase identity resolves to.
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
