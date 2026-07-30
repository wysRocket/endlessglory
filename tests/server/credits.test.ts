process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_credits_routes';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/db', () => ({
  accountAndScopeForToken: vi.fn(),
  grantAccountWeaponSkins: vi.fn(async () => ({
    completedQuestIds: [],
    mechChromaIds: [],
    weaponSkinIds: [],
    weaponSkinLoadout: {},
  })),
  moderationStatusForAccount: vi.fn(),
  scopeAllowsMutation: vi.fn(() => true),
}));

vi.mock('../../server/credits_proxy', async (importActual) => {
  const actual = await importActual<typeof import('../../server/credits_proxy')>();
  return {
    ...actual,
    creditsSpend: vi.fn(),
    creditsStore: vi.fn(),
  };
});

import {
  configureCreditsRuntime,
  creditsPreAuthMutationRateLimited,
  handleCreditsApi,
  resetCreditsDbForTests,
  routes,
  setCreditsDbForTests,
} from '../../server/credits';
import { creditsSpend, creditsStore, creditsStripeWebhook } from '../../server/credits_proxy';
import { desktopWalletHandoffs } from '../../server/desktop_wallet_handoff';
import { compose } from '../../server/http/compose';
import {
  CREDITS_CONFIRM_MAX_PER_MINUTE,
  CREDITS_PURCHASE_MAX_PER_MINUTE,
  CREDITS_QUOTE_MAX_PER_MINUTE,
  CREDITS_SPEND_MAX_PER_MINUTE,
  resetCreditsMutationRateLimits,
} from '../../server/ratelimit';
import { FakeRes, fakeCtx, makeReq } from './helpers';

const spendMock = vi.mocked(creditsSpend);
const storeMock = vi.mocked(creditsStore);
const grantWeaponSkins = vi.fn();

const MONETARY_MUTATION_ROUTES = [
  {
    path: '/api/credits/purchase',
    limit: CREDITS_PURCHASE_MAX_PER_MINUTE,
  },
  {
    path: '/api/credits/native/quote',
    limit: CREDITS_QUOTE_MAX_PER_MINUTE,
  },
  {
    path: '/api/credits/native/confirm',
    limit: CREDITS_CONFIRM_MAX_PER_MINUTE,
  },
  {
    path: '/api/credits/spend',
    limit: CREDITS_SPEND_MAX_PER_MINUTE,
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  resetCreditsMutationRateLimits();
  configureCreditsRuntime({ grantWeaponSkins });
});

afterEach(() => {
  desktopWalletHandoffs.clear();
  resetCreditsDbForTests();
  resetCreditsMutationRateLimits();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function responseJson(res: FakeRes): unknown {
  return JSON.parse(res.body);
}

describe('Credits spend entitlement mirroring', () => {
  it('does not advertise the legacy SOL price route that the service does not expose', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({ method: 'GET', url: '/api/credits/price/sol' }),
      res as never,
      7,
    );

    expect(responseJson(res)).toEqual({
      rail: '',
      usdPerCredit: null,
      wocBaseUnitsPerCredit: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mounts an IP limiter before auth and an account limiter after auth on every mutation', () => {
    for (const { path } of MONETARY_MUTATION_ROUTES) {
      const route = routes.find((entry) => entry.method === 'POST' && entry.path === path);
      expect(route?.middleware).toHaveLength(3);
    }
  });

  it.each(MONETARY_MUTATION_ROUTES)(
    'limits invalid-token floods on $path before they can perform unlimited DB reads',
    async ({ path, limit }) => {
      const accountAndScopeForToken = vi.fn(async () => null);
      setCreditsDbForTests({ accountAndScopeForToken });
      const route = routes.find((entry) => entry.method === 'POST' && entry.path === path);
      if (!route?.middleware) throw new Error(`missing mutation middleware for ${path}`);
      const runMiddleware = compose([...route.middleware]);

      for (let i = 0; i < limit; i++) {
        const ctx = fakeCtx({
          method: 'POST',
          url: path,
          headers: { authorization: `Bearer ${'a'.repeat(64)}` },
        });
        await runMiddleware(ctx);
        expect((ctx.res as unknown as FakeRes).statusCode).toBe(401);
      }

      const limited = fakeCtx({
        method: 'POST',
        url: path,
        headers: { authorization: `Bearer ${'a'.repeat(64)}` },
      });
      await expect(runMiddleware(limited)).rejects.toMatchObject({ status: 429 });
      expect(accountAndScopeForToken).toHaveBeenCalledTimes(limit);
    },
  );

  it.each(MONETARY_MUTATION_ROUTES)(
    'fuses authenticated $path limits across IP and account keys',
    async ({ path, limit }) => {
      const accountAndScopeForToken = vi.fn(async () => ({
        accountId: 41,
        scope: 'full' as const,
      }));
      const moderationStatusForAccount = vi.fn(async () => ({ locked: false }) as never);
      setCreditsDbForTests({ accountAndScopeForToken, moderationStatusForAccount });
      const route = routes.find((entry) => entry.method === 'POST' && entry.path === path);
      if (!route?.middleware) throw new Error(`missing mutation middleware for ${path}`);
      const runMiddleware = compose([...route.middleware]);

      for (let i = 0; i < limit; i++) {
        const ctx = fakeCtx({
          method: 'POST',
          url: path,
          ip: `192.0.2.${i + 1}`,
          headers: {
            authorization: `Bearer ${'b'.repeat(64)}`,
            'x-forwarded-for': `192.0.2.${i + 1}`,
          },
        });
        await runMiddleware(ctx);
        expect(ctx.account?.accountId).toBe(41);
      }

      const limited = fakeCtx({
        method: 'POST',
        url: path,
        ip: '198.51.100.1',
        headers: {
          authorization: `Bearer ${'b'.repeat(64)}`,
          'x-forwarded-for': '198.51.100.1',
        },
      });
      await expect(runMiddleware(limited)).rejects.toMatchObject({ status: 429 });
      expect(accountAndScopeForToken).toHaveBeenCalledTimes(limit + 1);
    },
  );

  it.each(MONETARY_MUTATION_ROUTES)(
    'lets the legacy pre-auth helper stop $path before bearer resolution',
    async ({ path, limit }) => {
      const resolveBearer = vi.fn(async () => undefined);
      const attempt = async (): Promise<boolean> => {
        const outcome = creditsPreAuthMutationRateLimited(
          makeReq({
            method: 'POST',
            url: path,
            headers: { authorization: `Bearer ${'a'.repeat(64)}` },
          }),
        );
        if (outcome && !outcome.allowed) return false;
        await resolveBearer();
        return true;
      };

      for (let i = 0; i < limit; i++) expect(await attempt()).toBe(true);
      expect(await attempt()).toBe(false);
      expect(resolveBearer).toHaveBeenCalledTimes(limit);
    },
  );

  it('filters retired catalog rows and unknown skins out of the game storefront', async () => {
    storeMock.mockResolvedValue({
      available: true,
      items: [
        {
          itemId: 'guildmark_arming_sword',
          name: 'Guildmark Arming Sword',
          kind: 'skin',
          costCredits: 200,
          owned: false,
        },
        {
          itemId: 'retired_placeholder_hat',
          name: 'Retired Placeholder Hat',
          kind: 'cosmetic',
          costCredits: 10,
          owned: false,
        },
        {
          itemId: 'unknown_weapon_skin',
          name: 'Unknown Weapon Skin',
          kind: 'skin',
          costCredits: 10,
          owned: false,
        },
        {
          itemId: '__proto__',
          name: 'Prototype Pollution Skin',
          kind: 'skin',
          costCredits: 10,
          owned: false,
        },
      ],
    });
    const res = new FakeRes();

    await handleCreditsApi(makeReq({ method: 'GET', url: '/api/credits/store' }), res as never, 7);

    expect(responseJson(res)).toEqual({
      available: true,
      items: [
        {
          itemId: 'guildmark_arming_sword',
          name: 'Guildmark Arming Sword',
          kind: 'skin',
          costCredits: 200,
          owned: false,
        },
      ],
    });
  });

  it.each([
    { itemId: 'guildmark_arming_sword', kind: 'item' },
    { itemId: 'retired_placeholder_hat', kind: 'skin' },
    { itemId: '__proto__', kind: 'skin' },
  ])('rejects unsupported store spend $itemId/$kind before debiting Credits', async (body) => {
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/spend',
        body: { ...body, expectedCostCredits: 200, idempotencyKey: 'unsupported-key' },
      }),
      res as never,
      7,
    );

    expect(responseJson(res)).toEqual({
      granted: false,
      balance: null,
      costCredits: null,
      reason: 'unknown_item',
    });
    expect(spendMock).not.toHaveBeenCalled();
  });

  it('rejects a string expected cost before calling the monetary service', async () => {
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/spend',
        body: {
          itemId: 'guildmark_arming_sword',
          kind: 'skin',
          expectedCostCredits: '200',
          idempotencyKey: 'string-cost-key',
        },
      }),
      res as never,
      7,
    );

    expect(responseJson(res)).toEqual({
      granted: false,
      balance: null,
      costCredits: null,
      reason: 'invalid_request',
    });
    expect(spendMock).not.toHaveBeenCalled();
  });

  it('does not mirror a caller item until the authoritative store owns that exact skin', async () => {
    spendMock.mockResolvedValue({
      // The in-memory companion backend historically reported a reused key as
      // granted:true, while Postgres reported granted:false. The game must be safe
      // against either representation.
      granted: true,
      balance: 0,
      costCredits: 200,
      reason: 'already_granted',
    });
    storeMock.mockResolvedValue({
      available: true,
      items: [
        {
          itemId: 'guildmark_arming_sword',
          name: 'Guildmark Arming Sword',
          kind: 'skin',
          costCredits: 200,
          owned: true,
        },
        {
          itemId: 'solheim_sword',
          name: 'Solheim, Last Light of the Dawn',
          kind: 'skin',
          costCredits: 5000,
          owned: false,
        },
      ],
    });

    const req = makeReq({
      method: 'POST',
      url: '/api/credits/spend',
      body: {
        itemId: 'solheim_sword',
        kind: 'skin',
        expectedCostCredits: 200,
        idempotencyKey: 'reused-key',
      },
    });
    const res = new FakeRes();

    await handleCreditsApi(req, res as never, 7);

    expect(spendMock).toHaveBeenCalledWith({
      accountId: 7,
      itemId: 'solheim_sword',
      kind: 'skin',
      expectedCostCredits: 200,
      idempotencyKey: 'reused-key',
    });
    expect(storeMock).toHaveBeenCalledWith(7);
    expect(grantWeaponSkins).not.toHaveBeenCalled();
  });

  it('mirrors a skin only after the authoritative store confirms that item is owned', async () => {
    spendMock.mockResolvedValue({
      granted: true,
      balance: 300,
      costCredits: 200,
      reason: null,
    });
    storeMock.mockResolvedValue({
      available: true,
      items: [
        {
          itemId: 'guildmark_arming_sword',
          name: 'Guildmark Arming Sword',
          kind: 'skin',
          costCredits: 200,
          owned: true,
        },
      ],
    });

    const req = makeReq({
      method: 'POST',
      url: '/api/credits/spend',
      body: {
        itemId: 'guildmark_arming_sword',
        kind: 'skin',
        expectedCostCredits: 200,
        idempotencyKey: 'fresh-key',
      },
    });
    const res = new FakeRes();

    await handleCreditsApi(req, res as never, 7);

    expect(spendMock).toHaveBeenCalledWith({
      accountId: 7,
      itemId: 'guildmark_arming_sword',
      kind: 'skin',
      expectedCostCredits: 200,
      idempotencyKey: 'fresh-key',
    });
    expect(storeMock).toHaveBeenCalledWith(7);
    expect(grantWeaponSkins).toHaveBeenCalledWith(7, ['guildmark_arming_sword']);
  });
});

describe('Credits economy-service transport contract', () => {
  it('marks typed HTTP 200 read fallbacks unavailable when the economy service is off', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', '');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', '');
    const cases = [
      {
        url: '/api/credits/balance',
        expected: { available: false, balance: null },
      },
      {
        url: '/api/credits/skus',
        expected: { available: false, skus: [] },
      },
      {
        url: '/api/credits/native/rails',
        expected: { available: false, rails: { sol: false, usdc: false, woc: false } },
      },
      {
        url: '/api/credits/native/balance/usdc/walletowner',
        expected: { owner: 'walletowner', amountBase: null },
      },
    ];

    for (const { url, expected } of cases) {
      const res = new FakeRes();
      await handleCreditsApi(makeReq({ method: 'GET', url }), res as never, 7);
      expect(responseJson(res)).toEqual(expected);
    }
  });

  it('marks typed read responses available only after authoritative service data loads', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/balance/7')) {
          return new Response(JSON.stringify({ balance: 250 }), { status: 200 });
        }
        if (url.endsWith('/skus')) {
          return new Response(JSON.stringify([{ sku: 'credits_500', usd: 4.99, claudium: 500 }]), {
            status: 200,
          });
        }
        if (url.endsWith('/native/rails')) {
          return new Response(JSON.stringify({ rails: { sol: true, usdc: true, woc: true } }), {
            status: 200,
          });
        }
        if (url.endsWith('/native/balance/usdc/walletowner')) {
          return new Response(JSON.stringify({ owner: 'walletowner', amountBase: '12345678' }), {
            status: 200,
          });
        }
        return new Response(null, { status: 404 });
      }),
    );
    const cases = [
      {
        url: '/api/credits/balance',
        expected: { available: true, balance: 250 },
      },
      {
        url: '/api/credits/skus',
        expected: {
          available: true,
          skus: [{ sku: 'credits_500', usd: 4.99, credits: 500 }],
        },
      },
      {
        url: '/api/credits/native/rails',
        expected: { available: true, rails: { sol: true, usdc: true, woc: true } },
      },
      {
        url: '/api/credits/native/balance/usdc/walletowner',
        expected: { owner: 'walletowner', amountBase: '12345678' },
      },
    ];

    for (const { url, expected } of cases) {
      const res = new FakeRes();
      await handleCreditsApi(makeReq({ method: 'GET', url }), res as never, 7);
      expect(responseJson(res)).toEqual(expected);
    }
  });

  it('forwards Stripe webhook bytes and signature without reserializing them', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ received: true }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const rawBody = Buffer.from('{\n  "type": "checkout.session.completed"\n}\n');

    await expect(creditsStripeWebhook(rawBody, 't=123,v1=signature')).resolves.toEqual({
      received: true,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ 'stripe-signature': 't=123,v1=signature' });
    expect(Buffer.from(request.body as Uint8Array).equals(rawBody)).toBe(true);
  });

  it('keeps accountId numeric in purchase JSON bodies', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    let sent: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            purchaseId: 'purchase-1',
            rail: 'stripe',
            claudium: 500,
            stripe: { clientSecret: 'secret', publishableKey: 'pk_test' },
          }),
          { status: 200 },
        );
      }),
    );
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/purchase',
        body: { rail: 'stripe', sku: 'credits_500', idempotencyKey: 'purchase-key' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(sent).toMatchObject({ accountId: 7 });
    expect(typeof (sent as { accountId: unknown }).accountId).toBe('number');
  });

  it.each([
    { stripe: undefined, label: 'missing intent' },
    { stripe: { clientSecret: '', publishableKey: 'pk_test' }, label: 'empty client secret' },
    { stripe: { clientSecret: 'secret', publishableKey: '' }, label: 'empty publishable key' },
  ])('fails closed on a malformed 2xx Stripe success: $label', async ({ stripe }) => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              purchaseId: 'purchase-1',
              rail: 'stripe',
              claudium: 500,
              stripe,
            }),
            { status: 200 },
          ),
      ),
    );
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/purchase',
        body: { rail: 'stripe', sku: 'credits_500', idempotencyKey: 'purchase-key' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(responseJson(res)).toEqual({
      ok: false,
      purchaseId: null,
      rail: null,
      credits: null,
      stripe: null,
      woc: null,
      reason: 'unavailable',
    });
  });

  it('preserves authoritative 2xx purchase refusals as ok:false', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ reason: 'rail_disabled' }), { status: 200 })),
    );
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/purchase',
        body: { rail: 'stripe', sku: 'credits_500', idempotencyKey: 'purchase-key' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(responseJson(res)).toEqual({
      ok: false,
      purchaseId: null,
      rail: null,
      credits: null,
      stripe: null,
      woc: null,
      reason: 'rail_disabled',
    });
  });

  it('keeps the legacy purchase endpoint Stripe-only', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/purchase',
        body: { rail: 'woc', sku: 'credits_500', idempotencyKey: 'purchase-key' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(responseJson(res)).toEqual({
      ok: false,
      purchaseId: null,
      rail: null,
      credits: null,
      stripe: null,
      woc: null,
      reason: 'invalid_request',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops partial purchase fields while preserving an authoritative refusal reason', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              purchaseId: '',
              rail: 'stripe',
              claudium: 500,
              stripe: { clientSecret: 'must-not-escape', publishableKey: 'pk_test' },
              reason: 'unknown_sku',
            }),
            { status: 200 },
          ),
      ),
    );
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/purchase',
        body: { rail: 'stripe', sku: 'retired_sku', idempotencyKey: 'purchase-key' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(responseJson(res)).toEqual({
      ok: false,
      purchaseId: null,
      rail: null,
      credits: null,
      stripe: null,
      woc: null,
      reason: 'unknown_sku',
    });
  });

  it('preserves authoritative native-quote refusals as ok:false', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ reason: 'rail_disabled' }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/native/quote',
        body: { rail: 'sol', sku: 'credits_500', payer: 'payer-address' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(responseJson(res)).toEqual({
      ok: false,
      reference: null,
      rail: null,
      credits: null,
      amountBase: null,
      destination: null,
      mint: null,
      memo: null,
      quoteExpiryMs: null,
      transactionBase64: null,
      split: null,
      reason: 'rail_disabled',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      rail: 'sol',
      sku: 'credits_500',
      payer: 'payer-address',
      fulfillment: { kind: 'credit', accountId: 7 },
    });
  });

  it('accepts USDC as a native quote rail', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    const quoteExpiryMs = Date.now() + 60_000;
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            reference: 'CLM_usdc',
            rail: 'usdc',
            claudium: 500,
            amountBase: '4990000',
            destination: 'treasury-owner',
            mint: 'usdc-mint',
            memo: 'CLM_usdc',
            quoteExpiryMs,
            transactionBase64: 'transaction',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/native/quote',
        body: { rail: 'usdc', sku: 'credits_500', payer: 'payer-address' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(responseJson(res)).toMatchObject({
      ok: true,
      reference: 'CLM_usdc',
      rail: 'usdc',
      amountBase: '4990000',
    });
    const created = desktopWalletHandoffs.createTransaction(7, '198.51.100.8', {
      reference: 'CLM_usdc',
      expectedAddress: 'payer-address',
    });
    expect(desktopWalletHandoffs.claim(created.code, '198.51.100.8')).toMatchObject({
      kind: 'transaction',
      reference: 'CLM_usdc',
      transactionBase64: 'transaction',
      rail: 'usdc',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      rail: 'usdc',
      sku: 'credits_500',
      payer: 'payer-address',
      fulfillment: { kind: 'credit', accountId: 7 },
    });
  });

  it('binds native confirmation to the authenticated account', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({ settled: false, reason: 'account_mismatch', fulfillment: null }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'POST',
        url: '/api/credits/native/confirm',
        body: { reference: 'payment-reference', signature: 'payment-signature' },
      }),
      res as never,
      7,
      { rateLimitApplied: true },
    );

    expect(responseJson(res)).toEqual({
      settled: false,
      balance: null,
      reason: 'account_mismatch',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      accountId: 7,
      reference: 'payment-reference',
      signature: 'payment-signature',
    });
  });

  it('prices bonus packs by service SKU instead of treating credited Credits as USD cents', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ rail: 'sol', claudium: 13_000, amountBase: '9999000' }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({
        method: 'GET',
        url: '/api/credits/native/price/sol?sku=credits_13000',
      }),
      res as never,
      7,
    );

    expect(responseJson(res)).toEqual({
      rail: 'sol',
      credits: 13_000,
      amountBase: '9999000',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://economy.example/v1/credits/native/price/sol?sku=credits_13000',
    );
  });

  it('maps history responses to the economy SDK ledger-entry shape', async () => {
    vi.stubEnv('WOC_ECONOMY_SERVICE_URL', 'https://economy.example/v1/credits/');
    vi.stubEnv('WOC_ECONOMY_INTERNAL_SECRET', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                entryId: 'entry-1',
                accountId: 7,
                delta: -200,
                reason: 'spend',
                ref: 'guildmark_arming_sword',
                atMs: 1234,
              },
              {
                entryId: 'wrong-account-entry',
                accountId: 8,
                delta: 5000,
                reason: 'purchase_stripe',
                ref: 'other-account-purchase',
                atMs: 1235,
              },
              { id: 'legacy-row', kind: 'spend', credits: -200, atMs: 1233 },
            ]),
            { status: 200 },
          ),
      ),
    );
    const res = new FakeRes();

    await handleCreditsApi(
      makeReq({ method: 'GET', url: '/api/credits/history' }),
      res as never,
      7,
    );

    expect(responseJson(res)).toEqual({
      entries: [
        {
          entryId: 'entry-1',
          accountId: 7,
          delta: -200,
          reason: 'spend',
          ref: 'guildmark_arming_sword',
          atMs: 1234,
        },
      ],
    });
  });
});
