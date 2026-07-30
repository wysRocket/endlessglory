// Game-server REST routes for CREDITS, the server-authoritative soft currency.
//
// The browser hits these same-origin /api/credits/* routes on the GAME server;
// each route resolves the caller's account from the bearer token (activeGuard),
// then proxies to the external economy service through server/credits_proxy.ts,
// which fails closed (typed unavailable results, never throws) when the service
// is unset or unreachable. This module therefore stays a thin authenticated
// pass-through: it computes NO peg/price/balance, it only forwards.
//
// One shared dispatch core, handleCreditsApi(req, res, accountId), is called by
// BOTH the migrated RouteDef handlers (registered in server/http/registry.ts) and
// the legacy handleApi prefix arm in server/main.ts (startsWith('/api/credits')),
// mirroring the daily-rewards twin. The dual-edit invariant keeps them in lockstep
// until the legacy ladder is removed.
//
// Rebrand note: this surface was named "Claudium" until the Endless Glory
// rebrand; the routes, types, and JSON field names here are this repo's own and
// were renamed throughout. server/credits_proxy.ts owns the one place that
// still talks `claudium` literally, the external economy service's own wire
// contract.

import type * as http from 'node:http';
import { WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import {
  type CreditsNativeRail,
  type CreditsPriceRail,
  creditsBalance,
  creditsHistory,
  creditsNativeConfirm,
  creditsNativePrice,
  creditsNativeQuote,
  creditsNativeRails,
  creditsPrice,
  creditsPurchase,
  creditsServiceConfigured,
  creditsSkus,
  creditsSolBalance,
  creditsSpend,
  creditsStore,
  creditsStripeWebhook,
  creditsUsdcBalance,
} from './credits_proxy';
import { accountAndScopeForToken, grantAccountWeaponSkins, moderationStatusForAccount } from './db';
import { ctxAccountId } from './http/context';
import { type BearerActiveGuardDb, createActiveGuard } from './http/middleware/bearer_active_guard';
import {
  CREDITS_CONFIRM_POLICY,
  CREDITS_CONFIRM_PRE_AUTH_POLICY,
  CREDITS_PURCHASE_POLICY,
  CREDITS_PURCHASE_PRE_AUTH_POLICY,
  CREDITS_QUOTE_POLICY,
  CREDITS_QUOTE_PRE_AUTH_POLICY,
  CREDITS_SPEND_POLICY,
  CREDITS_SPEND_PRE_AUTH_POLICY,
  rateLimit,
} from './http/middleware/rate_limit';
import type { Ctx, RateLimitOutcome, RouteDef } from './http/types';
import { json, readBinaryBody, readBody } from './http_util';
import {
  type CreditsMutationAction,
  creditsMutationRateLimited,
  creditsPreAuthRateLimited as creditsPreAuthIpRateLimited,
} from './ratelimit';

const STRIPE_WEBHOOK_MAX_BYTES = 1024 * 1024;

function makeRealCreditsDb() {
  return { accountAndScopeForToken, moderationStatusForAccount };
}
type CreditsGuardDb = ReturnType<typeof makeRealCreditsDb>;
let realCreditsDb: CreditsGuardDb | undefined;
let creditsDbOverride: CreditsGuardDb | undefined;
function creditsGuardDb(): BearerActiveGuardDb {
  if (creditsDbOverride) return creditsDbOverride;
  realCreditsDb ??= makeRealCreditsDb();
  return realCreditsDb;
}

/** Override the guard db with a fake (test-only; merges over the real reads). */
export function setCreditsDbForTests(overrides: Partial<CreditsGuardDb>): void {
  realCreditsDb ??= makeRealCreditsDb();
  creditsDbOverride = { ...realCreditsDb, ...overrides };
}

/** Restore the real guard db after a setCreditsDbForTests override (test-only). */
export function resetCreditsDbForTests(): void {
  creditsDbOverride = undefined;
}

/** Full active-session gate (mirrors the daily-rewards prefix arm). */
const activeGuard = createActiveGuard(() => creditsGuardDb());

function parseRail(value: unknown): CreditsPriceRail | null {
  return value === 'stripe' || value === 'woc' ? value : null;
}

function parseNativeRail(value: unknown): CreditsNativeRail | null {
  return value === 'sol' || value === 'usdc' || value === 'woc' ? value : null;
}

function parseSpendKind(value: unknown): 'cosmetic' | 'skin' | 'item' | null {
  return value === 'cosmetic' || value === 'skin' || value === 'item' ? value : null;
}

function isKnownWeaponSkinId(itemId: string): boolean {
  return Object.hasOwn(WEAPON_SKINS, itemId);
}

function creditsMutationAction(req: http.IncomingMessage): CreditsMutationAction | null {
  if (req.method !== 'POST') return null;
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/api/credits/purchase') return 'purchase';
  if (path === '/api/credits/native/quote') return 'quote';
  if (path === '/api/credits/native/confirm') {
    return 'confirm';
  }
  if (path === '/api/credits/spend') return 'spend';
  return null;
}

/** Legacy-dispatch pre-auth guard, shared with the registered route policies. */
export function creditsPreAuthMutationRateLimited(
  req: http.IncomingMessage,
): RateLimitOutcome | null {
  const action = creditsMutationAction(req);
  return action ? creditsPreAuthIpRateLimited(req, action) : null;
}

/** Whether the economy service env is configured (does not confirm reachability). */
export function creditsConfigured(): boolean {
  return creditsServiceConfigured();
}

// Live-game hooks, injected from server/main.ts exactly like configureDiscordRuntime
// so `export const routes` stays a static array. The economy service is the
// ownership source of truth for Credits purchases; these hooks mirror weapon-skin
// grants into the rollback-safe game entitlement table so the in-game equip gate
// and identity wire see them immediately (and the self-snapshot pushes to any live
// session).
interface CreditsGameHooks {
  grantWeaponSkins(accountId: number, skinIds: string[]): void;
}
let creditsRuntime: CreditsGameHooks | null = null;

export function configureCreditsRuntime(rt: CreditsGameHooks): void {
  creditsRuntime = rt;
}

function noteWeaponSkinGrants(accountId: number, skinIds: string[]): void {
  const known = skinIds.filter(isKnownWeaponSkinId);
  if (known.length === 0) return;
  if (creditsRuntime) {
    creditsRuntime.grantWeaponSkins(accountId, known);
    return;
  }
  // No live game wired (tests/tools): persist directly so ownership still lands.
  void grantAccountWeaponSkins(accountId, known).catch((err) =>
    console.error('failed to persist weapon skin grant:', err),
  );
}

export async function handleCreditsStripeWebhook(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const signature = String(req.headers['stripe-signature'] ?? '');
  const rawBody = await readBinaryBody(req, STRIPE_WEBHOOK_MAX_BYTES);
  const result = await creditsStripeWebhook(rawBody, signature);
  return json(res, result.received ? 200 : 400, result);
}

/**
 * The one dispatch core the RouteDef handlers and the legacy prefix arm share. It
 * matches by method + pathname, forwards to the proxy (which fails closed), and
 * writes the JSON result. It never throws: an invalid request resolves to a typed
 * unavailable/invalid body, so the game stays playable with the service off.
 */
export async function handleCreditsApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  accountId: number,
  options: { rateLimitApplied?: boolean } = {},
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  const mutationAction = creditsMutationAction(req);
  // The registered routes use the two-tier middleware. The retained legacy
  // dispatcher reaches this same core directly, so preserve rollback protection
  // with the identical tier-1 fused limiter instead of leaving that arm unlimited.
  if (mutationAction && !options.rateLimitApplied) {
    const outcome = creditsMutationRateLimited(req, accountId, mutationAction);
    if (!outcome.allowed) return json(res, 429, { error: 'rate_limited' });
  }

  if (req.method === 'GET' && path === '/api/credits/balance') {
    return json(res, 200, await creditsBalance(accountId));
  }
  // The one :param route in the family. The Match-regex idiom (a single capture
  // group over the :rail segment) is what the pipeline's route-inventory scanner
  // recognizes as the legacy dispatch arm for /api/credits/price/:rail.
  const priceMatch = /^\/api\/credits\/price\/(\w+)$/.exec(path);
  if (req.method === 'GET' && priceMatch) {
    const rail = parseRail(decodeURIComponent(priceMatch[1]));
    if (!rail) {
      return json(res, 200, { rail: '', usdPerCredit: null, wocBaseUnitsPerCredit: null });
    }
    return json(res, 200, await creditsPrice(rail));
  }
  if (req.method === 'GET' && path === '/api/credits/skus') {
    return json(res, 200, await creditsSkus());
  }
  if (req.method === 'GET' && path === '/api/credits/native/rails') {
    return json(res, 200, await creditsNativeRails());
  }
  const nativePriceMatch = /^\/api\/credits\/native\/price\/(\w+)$/.exec(path);
  if (req.method === 'GET' && nativePriceMatch) {
    const rail = parseNativeRail(decodeURIComponent(nativePriceMatch[1]));
    const sku = url.searchParams.get('sku')?.trim() ?? '';
    if (!rail || sku === '') {
      return json(res, 200, {
        rail: rail ?? 'sol',
        credits: null,
        amountBase: null,
        reason: 'invalid_request',
      });
    }
    return json(res, 200, await creditsNativePrice(rail, sku));
  }
  const solBalanceMatch = /^\/api\/credits\/native\/balance\/sol\/(\w+)$/.exec(path);
  if (req.method === 'GET' && solBalanceMatch) {
    return json(res, 200, await creditsSolBalance(decodeURIComponent(solBalanceMatch[1])));
  }
  const usdcBalanceMatch = /^\/api\/credits\/native\/balance\/usdc\/(\w+)$/.exec(path);
  if (req.method === 'GET' && usdcBalanceMatch) {
    return json(res, 200, await creditsUsdcBalance(decodeURIComponent(usdcBalanceMatch[1])));
  }
  if (req.method === 'GET' && path === '/api/credits/store') {
    const store = await creditsStore(accountId);
    const supportedStore = {
      ...store,
      items: store.items.filter((item) => item.kind === 'skin' && isKnownWeaponSkinId(item.itemId)),
    };
    // Reconcile: the service's grant ledger is authoritative for purchases, so
    // mirror any owned weapon skins the game DB does not know about yet.
    noteWeaponSkinGrants(
      accountId,
      supportedStore.items.filter((item) => item.owned).map((item) => item.itemId),
    );
    return json(res, 200, supportedStore);
  }
  if (req.method === 'GET' && path === '/api/credits/history') {
    return json(res, 200, await creditsHistory(accountId));
  }
  if (req.method === 'POST' && path === '/api/credits/purchase') {
    const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>;
    const rail = body.rail === 'stripe' ? 'stripe' : null;
    const sku = typeof body.sku === 'string' ? body.sku : '';
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (!rail || sku === '' || idempotencyKey === '') {
      return json(res, 200, {
        ok: false,
        purchaseId: null,
        rail: null,
        credits: null,
        stripe: null,
        woc: null,
        reason: 'invalid_request',
      });
    }
    return json(res, 200, await creditsPurchase({ accountId, rail, sku, idempotencyKey }));
  }
  if (req.method === 'POST' && path === '/api/credits/native/quote') {
    const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>;
    const rail = parseNativeRail(body.rail);
    const sku = typeof body.sku === 'string' ? body.sku : '';
    const payer = typeof body.payer === 'string' ? body.payer : '';
    if (!rail || sku === '' || payer === '') {
      return json(res, 200, {
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
        reason: 'invalid_request',
      });
    }
    return json(res, 200, await creditsNativeQuote({ accountId, rail, sku, payer }));
  }
  if (req.method === 'POST' && path === '/api/credits/native/confirm') {
    const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>;
    const reference = typeof body.reference === 'string' ? body.reference : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';
    if (reference === '' || signature === '') {
      return json(res, 200, { settled: false, balance: null, reason: 'invalid_request' });
    }
    return json(res, 200, await creditsNativeConfirm({ accountId, reference, signature }));
  }
  if (req.method === 'POST' && path === '/api/credits/spend') {
    const body = (await readBody(req).catch(() => ({}))) as Record<string, unknown>;
    const itemId = typeof body.itemId === 'string' ? body.itemId : '';
    const kind = parseSpendKind(body.kind);
    const expectedCostCredits =
      typeof body.expectedCostCredits === 'number' ? body.expectedCostCredits : Number.NaN;
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (
      itemId === '' ||
      !kind ||
      !Number.isSafeInteger(expectedCostCredits) ||
      expectedCostCredits <= 0 ||
      idempotencyKey === ''
    ) {
      return json(res, 200, {
        granted: false,
        balance: null,
        costCredits: null,
        reason: 'invalid_request',
      });
    }
    if (kind !== 'skin' || !isKnownWeaponSkinId(itemId)) {
      return json(res, 200, {
        granted: false,
        balance: null,
        costCredits: null,
        reason: 'unknown_item',
      });
    }
    const result = await creditsSpend({
      accountId,
      itemId,
      kind,
      expectedCostCredits,
      idempotencyKey,
    });
    // Never mirror the caller-supplied item from the spend response alone. Spend
    // idempotency belongs to the economy service, and a stale or cross-item replay
    // must not turn an arbitrary request body into a paid entitlement. Re-read the
    // authoritative grant ledger and mirror only this exact owned skin. A transient
    // store failure leaves the game mirror untouched; the next store open heals it.
    if (result.granted || result.reason === 'already_granted') {
      const store = await creditsStore(accountId);
      const ownsRequestedSkin = store.items.some(
        (item) => item.kind === 'skin' && item.itemId === itemId && item.owned,
      );
      if (ownsRequestedSkin) noteWeaponSkinGrants(accountId, [itemId]);
    }
    return json(res, 200, result);
  }
  // An in-family unknown subpath / method (the account is already resolved).
  return json(res, 404, { error: 'unknown endpoint' });
}

/** A player route: the guard resolved the account; the shared core dispatches. */
function creditsHandler(ctx: Ctx): Promise<void> {
  return handleCreditsApi(ctx.req, ctx.res, ctxAccountId(ctx), { rateLimitApplied: true });
}

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/credits/stripe/webhook',
    surface: 'api',
    meta: { publicRead: true },
    handler: (ctx) => handleCreditsStripeWebhook(ctx.req, ctx.res),
  },
  {
    method: 'GET',
    path: '/api/credits/balance',
    surface: 'api',
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/price/:rail',
    surface: 'api',
    // :rail is a public enum ('stripe'|'woc'), NOT an account-owned resource, so
    // it carries no requireOwned loader; publicRead marks that intentional.
    meta: { publicRead: true },
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/skus',
    surface: 'api',
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/native/rails',
    surface: 'api',
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/native/price/:rail',
    surface: 'api',
    meta: { publicRead: true },
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/native/balance/sol/:owner',
    surface: 'api',
    meta: { publicRead: true },
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/native/balance/usdc/:owner',
    surface: 'api',
    meta: { publicRead: true },
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/store',
    surface: 'api',
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'GET',
    path: '/api/credits/history',
    surface: 'api',
    middleware: [activeGuard],
    handler: creditsHandler,
  },
  {
    method: 'POST',
    path: '/api/credits/purchase',
    surface: 'api',
    middleware: [
      rateLimit(CREDITS_PURCHASE_PRE_AUTH_POLICY),
      activeGuard,
      rateLimit(CREDITS_PURCHASE_POLICY),
    ],
    handler: creditsHandler,
  },
  {
    method: 'POST',
    path: '/api/credits/native/quote',
    surface: 'api',
    middleware: [
      rateLimit(CREDITS_QUOTE_PRE_AUTH_POLICY),
      activeGuard,
      rateLimit(CREDITS_QUOTE_POLICY),
    ],
    handler: creditsHandler,
  },
  {
    method: 'POST',
    path: '/api/credits/native/confirm',
    surface: 'api',
    middleware: [
      rateLimit(CREDITS_CONFIRM_PRE_AUTH_POLICY),
      activeGuard,
      rateLimit(CREDITS_CONFIRM_POLICY),
    ],
    handler: creditsHandler,
  },
  {
    method: 'POST',
    path: '/api/credits/spend',
    surface: 'api',
    middleware: [
      rateLimit(CREDITS_SPEND_PRE_AUTH_POLICY),
      activeGuard,
      rateLimit(CREDITS_SPEND_POLICY),
    ],
    handler: creditsHandler,
  },
];
