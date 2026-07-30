// Client-side typed fetch wrapper for the CREDITS economy surface.
//
// Same-origin only: it talks to the GAME server's /api/credits/* routes (never
// the economy service directly). Those routes proxy to the service and already
// fail closed, so this layer only has to survive a network hiccup or a logged-out
// caller. It NEVER throws into render: every failure resolves to the same typed
// unavailable state the disabled UI renders (balance null, empty skus/store, buy
// disabled). The client computes NO peg/price/balance; it renders what it gets.

import { apiUrl } from './online';

export type CreditsRail = 'stripe' | 'sol' | 'usdc' | 'woc';
export type CreditsPriceRail = 'stripe' | 'woc';
export type CreditsNativeRail = 'sol' | 'usdc' | 'woc';

export interface CreditsBalance {
  available?: boolean;
  balance: number | null;
}

export interface CreditsPrice {
  rail: string;
  usdPerCredits: number | null;
  wocBaseUnitsPerCredits: string | null;
}

export interface CreditsSku {
  sku: string;
  usd: number;
  credits: number;
  stripeConfigured?: boolean;
}

export interface CreditsStoreItem {
  itemId: string;
  name: string;
  kind: 'cosmetic' | 'skin' | 'item';
  costCredits: number;
  owned: boolean;
}

export interface CreditsStoreSnapshot {
  available: boolean;
  balance: number | null;
  items: CreditsStoreItem[];
}

export interface CreditsPackSnapshot {
  available: boolean;
  balance: number | null;
  skus: CreditsSku[];
  nativeRails: Record<CreditsNativeRail, boolean>;
}

export interface CreditsStripeIntent {
  clientSecret: string;
  publishableKey: string;
}

export interface CreditsWocIntent {
  amountBase: string;
  burnBase: string;
  treasuryBase: string;
  treasury: string;
  memo: string;
  expiresAtMs: number;
}

export interface CreditsPurchase {
  ok: boolean;
  purchaseId: string | null;
  rail: CreditsRail | null;
  credits: number | null;
  stripe: CreditsStripeIntent | null;
  woc: CreditsWocIntent | null;
  reason: string | null;
}

export interface CreditsNativeRails {
  available?: boolean;
  rails: Record<CreditsNativeRail, boolean>;
}

export interface CreditsNativePrice {
  rail: CreditsNativeRail;
  credits: number | null;
  amountBase: string | null;
  reason?: string;
}

export interface CreditsSolBalance {
  owner: string;
  lamports: string | null;
}

export interface CreditsUsdcBalance {
  owner: string;
  amountBase: string | null;
}

export interface CreditsNativeQuote {
  ok: boolean;
  reference: string | null;
  rail: CreditsNativeRail | null;
  credits: number | null;
  amountBase: string | null;
  destination: string | null;
  mint: string | null;
  memo: string | null;
  quoteExpiryMs: number | null;
  transactionBase64: string | null;
  reason: string | null;
}

export interface CreditsNativeConfirm {
  settled: boolean;
  balance: number | null;
  reason: string | null;
}

export interface CreditsSpend {
  granted: boolean;
  balance: number | null;
  costCredits: number | null;
  reason: string | null;
}

/** How the SDK reaches the authed game-server routes: a live token + realm base. */
export interface EconomyClientConfig {
  token(): string | null | undefined;
  base?: string;
}

const OFF_BALANCE: CreditsBalance = { available: false, balance: null };
const OFF_PRICE = (rail: string): CreditsPrice => ({
  rail,
  usdPerCredits: null,
  wocBaseUnitsPerCredits: null,
});
const OFF_SKUS: CreditsSku[] = [];
const OFF_STORE: CreditsStoreItem[] = [];
const OFF_NATIVE_RAILS: CreditsNativeRails = {
  available: false,
  rails: { sol: false, usdc: false, woc: false },
};
const OFF_PURCHASE: CreditsPurchase = {
  ok: false,
  purchaseId: null,
  rail: null,
  credits: null,
  stripe: null,
  woc: null,
  reason: 'unavailable',
};
const OFF_NATIVE_QUOTE: CreditsNativeQuote = {
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
  reason: 'unavailable',
};
const OFF_NATIVE_CONFIRM: CreditsNativeConfirm = {
  settled: false,
  balance: null,
  reason: 'unavailable',
};
const OFF_SPEND: CreditsSpend = {
  granted: false,
  balance: null,
  costCredits: null,
  reason: 'unavailable',
};

const NATIVE_CONFIRM_RETRY_REASONS = new Set([
  'not_found_onchain',
  'not_finalized',
  'cannot_verify',
  'unavailable',
  'processing',
  'post_verify_failed',
  'fulfillment_failed',
]);
const NATIVE_CONFIRM_RETRY_DELAYS_MS = [1000, 1500, 2500, 4000, 6000, 8000, 10_000];
const NATIVE_CONFIRM_MAX_RETRY_MS = 12 * 60_000;

export interface NativeConfirmRetryOptions {
  delayMs?(ms: number): Promise<void>;
  nowMs?(): number;
  maxElapsedMs?: number;
}

export class EconomyClient {
  constructor(private readonly cfg: EconomyClientConfig) {}

  private async getResult<T>(path: string, fallback: T): Promise<{ ok: boolean; value: T }> {
    const token = this.cfg.token();
    if (!token) return { ok: false, value: fallback };
    try {
      const res = await fetch(apiUrl(path, this.cfg.base ?? ''), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, value: fallback };
      return { ok: true, value: (await res.json()) as T };
    } catch {
      return { ok: false, value: fallback };
    }
  }

  private async get<T>(path: string, fallback: T): Promise<T> {
    return (await this.getResult(path, fallback)).value;
  }

  private async post<T>(path: string, body: unknown, fallback: T): Promise<T> {
    const token = this.cfg.token();
    if (!token) return fallback;
    try {
      const res = await fetch(apiUrl(path, this.cfg.base ?? ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) return fallback;
      return (await res.json()) as T;
    } catch {
      return fallback;
    }
  }

  balance(): Promise<CreditsBalance> {
    return this.get('/api/credits/balance', OFF_BALANCE);
  }

  price(rail: CreditsPriceRail): Promise<CreditsPrice> {
    return this.get(`/api/credits/price/${rail}`, OFF_PRICE(rail));
  }

  skus(): Promise<CreditsSku[]> {
    return this.get('/api/credits/skus', { skus: OFF_SKUS }).then((r) => r.skus ?? OFF_SKUS);
  }

  store(): Promise<CreditsStoreItem[]> {
    return this.get('/api/credits/store', { items: OFF_STORE }).then((r) => r.items ?? OFF_STORE);
  }

  async storeSnapshot(): Promise<CreditsStoreSnapshot> {
    const [balance, store] = await Promise.all([
      this.getResult('/api/credits/balance', OFF_BALANCE),
      this.getResult<{ available?: boolean; items: CreditsStoreItem[] }>('/api/credits/store', {
        available: false,
        items: OFF_STORE,
      }),
    ]);
    return {
      available:
        balance.ok &&
        balance.value.available !== false &&
        store.ok &&
        store.value.available !== false,
      balance: balance.value.balance,
      items: store.value.items ?? OFF_STORE,
    };
  }

  async packSnapshot(): Promise<CreditsPackSnapshot> {
    const [balance, skus, nativeRails] = await Promise.all([
      this.getResult('/api/credits/balance', OFF_BALANCE),
      this.getResult<{ available?: boolean; skus: CreditsSku[] }>('/api/credits/skus', {
        available: false,
        skus: OFF_SKUS,
      }),
      this.getResult('/api/credits/native/rails', OFF_NATIVE_RAILS),
    ]);
    return {
      available:
        balance.ok &&
        balance.value.available === true &&
        skus.ok &&
        skus.value.available === true &&
        nativeRails.ok &&
        nativeRails.value.available === true,
      balance: balance.value.balance,
      skus: skus.value.skus ?? OFF_SKUS,
      nativeRails: nativeRails.value.rails,
    };
  }

  nativeRails(): Promise<CreditsNativeRails> {
    return this.get('/api/credits/native/rails', OFF_NATIVE_RAILS);
  }

  nativePrice(rail: CreditsNativeRail, sku: string): Promise<CreditsNativePrice> {
    return this.get(`/api/credits/native/price/${rail}?sku=${encodeURIComponent(sku)}`, {
      rail,
      credits: null,
      amountBase: null,
      reason: 'unavailable',
    });
  }

  solBalance(owner: string): Promise<CreditsSolBalance> {
    return this.get(`/api/credits/native/balance/sol/${encodeURIComponent(owner)}`, {
      owner,
      lamports: null,
    });
  }

  usdcBalance(owner: string): Promise<CreditsUsdcBalance> {
    return this.get(`/api/credits/native/balance/usdc/${encodeURIComponent(owner)}`, {
      owner,
      amountBase: null,
    });
  }

  purchase(input: {
    rail: 'stripe';
    sku: string;
    idempotencyKey: string;
  }): Promise<CreditsPurchase> {
    return this.post('/api/credits/purchase', input, OFF_PURCHASE);
  }

  nativeQuote(input: {
    rail: CreditsNativeRail;
    sku: string;
    payer: string;
  }): Promise<CreditsNativeQuote> {
    return this.post('/api/credits/native/quote', input, OFF_NATIVE_QUOTE);
  }

  nativeConfirm(input: { reference: string; signature: string }): Promise<CreditsNativeConfirm> {
    return this.post('/api/credits/native/confirm', input, OFF_NATIVE_CONFIRM);
  }

  spend(input: {
    itemId: string;
    kind: 'cosmetic' | 'skin' | 'item';
    expectedCostCredits: number;
    idempotencyKey: string;
  }): Promise<CreditsSpend> {
    return this.post('/api/credits/spend', input, OFF_SPEND);
  }
}

/** A fresh idempotency key for a purchase/spend attempt (crypto-random, safe to retry). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetryNativeConfirm(result: CreditsNativeConfirm): boolean {
  return !result.settled && NATIVE_CONFIRM_RETRY_REASONS.has(result.reason ?? '');
}

export async function confirmNativeSettlement(
  client: Pick<EconomyClient, 'nativeConfirm'>,
  reference: string,
  signature: string,
  opts: NativeConfirmRetryOptions = {},
): Promise<CreditsNativeConfirm> {
  const wait = opts.delayMs ?? delayMs;
  const now = opts.nowMs ?? (() => Date.now());
  const maxElapsedMs = opts.maxElapsedMs ?? NATIVE_CONFIRM_MAX_RETRY_MS;
  const startedAt = now();
  let scheduledWaitMs = 0;
  let retryIndex = 0;
  let result = await client.nativeConfirm({ reference, signature });
  while (shouldRetryNativeConfirm(result)) {
    const wallElapsedMs = Math.max(0, now() - startedAt);
    const elapsedMs = Math.max(wallElapsedMs, scheduledWaitMs);
    if (elapsedMs >= maxElapsedMs) return result;
    const configuredDelay =
      NATIVE_CONFIRM_RETRY_DELAYS_MS[
        Math.min(retryIndex, NATIVE_CONFIRM_RETRY_DELAYS_MS.length - 1)
      ];
    const delay = Math.min(configuredDelay, maxElapsedMs - elapsedMs);
    if (delay <= 0) return result;
    retryIndex += 1;
    await wait(delay);
    scheduledWaitMs += delay;
    result = await client.nativeConfirm({ reference, signature });
  }
  return result;
}

/**
 * Optional client-side signers for the two purchase rails. main.ts passes these
 * once the live integrations exist; until then they are absent and the flow stops
 * cleanly after the server intent (no crash, nothing charged).
 *
 * - stripe: hand the returned clientSecret + publishableKey to Stripe.js and
 *   confirm the PaymentIntent client-side. Needs a live publishable key + Stripe.js.
 * - nativeSignAndSend: sign and send the service-built SOL, USDC, or WOC transaction,
 *   returning its signature to post to nativeConfirm. Needs a live wallet.
 */
export interface CreditsSigners {
  stripe?(intent: CreditsStripeIntent, purchaseId: string): Promise<void>;
  nativePayer?: string | null;
  nativeSignAndSend?(
    transactionBase64: string,
    rail: CreditsNativeRail,
    reference: string,
  ): Promise<string>;
}

/**
 * Orchestrate one purchase end to end: ask the server for the rail-specific intent,
 * then drive the client-side signing seam. This computes NOTHING about price or
 * credit; it only sequences the SDK calls. If the service is off (ok:false) or the
 * needed signer is not wired, it returns without charging anything.
 */
export async function startCreditsPurchase(
  client: EconomyClient,
  rail: CreditsRail,
  sku: string,
  signers: CreditsSigners = {},
): Promise<CreditsPurchase | CreditsNativeQuote | CreditsNativeConfirm> {
  if (rail === 'stripe') {
    const purchase = await client.purchase({ rail, sku, idempotencyKey: newIdempotencyKey() });
    if (!purchase.ok || !purchase.purchaseId) return purchase;
    // SEAM: the stripe confirmation needs Stripe.js + a live publishable key. When
    // a signer is wired, it confirms the PaymentIntent with the returned
    // clientSecret; otherwise the flow stops here with the server intent captured.
    if (purchase.stripe && signers.stripe) {
      await signers.stripe(purchase.stripe, purchase.purchaseId);
    }
    return purchase;
  }

  if (!signers.nativeSignAndSend) return OFF_NATIVE_QUOTE;
  const payer = signers.nativePayer ?? (await import('./wallet')).currentWallet().address;
  if (!payer) return OFF_NATIVE_QUOTE;
  const quote = await client.nativeQuote({ rail, sku, payer });
  if (!quote.ok || !quote.reference || !quote.transactionBase64) return quote;
  const signature = await signers.nativeSignAndSend(quote.transactionBase64, rail, quote.reference);
  // Once the wallet has broadcast a signature, confirmation is bounded by its
  // own recovery window rather than the quote's wall-clock expiry. The service
  // validates the transfer's on-chain block time, so a payment broadcast on time
  // remains eligible even if finality or downstream fulfillment lands later.
  return confirmNativeSettlement(client, quote.reference, signature);
}
