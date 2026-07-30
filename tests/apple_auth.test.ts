import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleAppleLoginNew,
  resetAppleKeyCacheForTests,
  verifyAppleIdentityToken,
} from '../server/apple_auth';
import {
  consumeApplePendingLogin,
  createApplePendingLogin,
  linkAppleAccount,
  peekApplePendingLogin,
  pruneApplePendingLogins,
} from '../server/apple_auth_db';
import { resetRateLimits } from '../server/ratelimit';
import { FakeRes, makeReq } from './server/helpers';

// Payload: { iss: 'https://appleid.apple.com', aud: 'com.endlessglory', exp: 4102444800,
// sub: 'apple-user-1', nonce: 'challenge-nonce', email: 'relay@example.com', email_verified: 'true' },
// signed with the matching (throwaway, test-only) RSA key below.
const APPLE_TOKEN =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2V5In0.eyJpc3MiOiJodHRwczovL2FwcGxlaWQuYXBwbGUuY29tIiwiYXVkIjoiY29tLmVuZGxlc3NnbG9yeSIsImV4cCI6NDEwMjQ0NDgwMCwic3ViIjoiYXBwbGUtdXNlci0xIiwibm9uY2UiOiJjaGFsbGVuZ2Utbm9uY2UiLCJlbWFpbCI6InJlbGF5QGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOiJ0cnVlIn0.CyW78MighJTb5e_28JY2m2u9yOmtI85uZnMKRAWJXaXRWsxcV-twb8RGeN8NO8iaJ6_ywn3AvSr5aTmOeqRIEGZo0R334BEvVlOb8qk_ryL9dpTQDqfDJAgVKD4BdJYSeG43OTLr4a5v_5HpX1_hS9scWNGUbtIY4KVGrxdMpzPR4k2pjEe_DRCTqCM_q5zx4WgqMt0asCJ80_UxmDpZAIvKFjXhS7fth8LYZ6N8TFANv2zSn3BNtZOAHypXyQChZruMUumE3gyFIav7A0GeZkaPc6ObwHR6MTan-jdyuD1IpFuJ9PzRFWO4DVhQDWSNPAemeJ9zFT0LumU8swLIng';
const APPLE_JWK = {
  kty: 'RSA',
  n: '0ZFDueOc75Ofq3sDYfQ9JX70X4LrCKhWsGoHOGgSN1UByKy9IDfU4gyQ-_A5cZMYcflIv_a8JsVK_pHuigB73IUMvVHwTB7ZHrJ6w81JCxuJQRchMY4kIuqZJx3YWfnJDxnFcgV1fXbzR-kvWqy4_Ovw8uWbZ5ZBWeRm5DVJHVcUd16WjsU_ym9Pb4-_u5amzbfL3mTiyGMaspCJTto4mIm5Uplrli5_Yv8cf15BX3tsbVNFW9LSQATKoBZQ7Klb6ListoQkby7SLsorrQOWdRTgAhJF82O7JDr8vV1Ap7Zm7GWu9nMEX47MqOSD4tZDNz1LFc9S0iPX8qdifEpLkQ',
  e: 'AQAB',
  kid: 'test-key',
  alg: 'RS256',
} as JsonWebKey;

afterEach(() => {
  vi.unstubAllGlobals();
  resetAppleKeyCacheForTests();
  resetRateLimits();
});

describe('Apple identity token verification', () => {
  it('accepts a signed token with the app audience and matching nonce', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [APPLE_JWK] }))),
    );
    await expect(verifyAppleIdentityToken(APPLE_TOKEN, 'challenge-nonce')).resolves.toEqual({
      subject: 'apple-user-1',
      email: 'relay@example.com',
      emailVerified: true,
    });
  });

  it('rejects replay under a different native challenge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [APPLE_JWK] }))),
    );
    await expect(verifyAppleIdentityToken(APPLE_TOKEN, 'other-nonce')).resolves.toBeNull();
  });

  it('refreshes the JWKS once when Apple rotates to an unknown key ID', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [APPLE_JWK] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyAppleIdentityToken(APPLE_TOKEN, 'challenge-nonce')).resolves.not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Apple account attachment guards', () => {
  it('fails closed when either side of the Apple link is already claimed', async () => {
    const pool = { query: vi.fn().mockRejectedValue({ code: '23505' }) };
    await expect(linkAppleAccount(pool as never, 7, 'subject', null)).resolves.toBe(false);
  });
});

describe('Apple pending login choices', () => {
  const row = {
    token: 'choice-token',
    apple_subject: 'apple-user-1',
    apple_email: 'player@example.com',
    apple_email_verified: true,
    display_name: 'Player One',
  };

  it('parks an expiring verified identity for the chooser', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    await createApplePendingLogin({ query } as never, {
      token: row.token,
      subject: row.apple_subject,
      email: row.apple_email,
      emailVerified: true,
      displayName: row.display_name,
      ttlMinutes: 15,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO apple_pending_logins'),
      [row.token, row.apple_subject, row.apple_email, true, row.display_name, '15'],
    );
  });

  it('peeks without consuming, then consumes with one atomic delete', async () => {
    const peekQuery = vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 });
    await expect(peekApplePendingLogin({ query: peekQuery } as never, row.token)).resolves.toEqual(
      row,
    );
    expect(String(peekQuery.mock.calls[0][0])).not.toContain('DELETE');

    const consumeQuery = vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 });
    await expect(
      consumeApplePendingLogin({ query: consumeQuery } as never, row.token),
    ).resolves.toEqual(row);
    expect(String(consumeQuery.mock.calls[0][0])).toContain('DELETE FROM apple_pending_logins');
  });

  it('deletes expired pending identities during maintenance', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 2 });
    await pruneApplePendingLogins({ query } as never);
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM apple_pending_logins WHERE expires_at <= now()',
    );
  });

  it('rejects blocked IP account creation before consuming the pending identity', async () => {
    const req = makeReq({ method: 'POST', url: '/api/auth/apple/login/new' });
    (req.socket as { remoteAddress: string }).remoteAddress = '203.0.113.9';
    const res = new FakeRes();
    const isIpBlocked = vi.fn(() => true);

    await handleAppleLoginNew(req, res as never, { linkToken: row.token }, isIpBlocked);

    expect(isIpBlocked).toHaveBeenCalledWith('203.0.113.9');
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body)).toEqual({
      error: 'rate limited',
      code: 'auth.too_many_attempts',
    });
  });
});
