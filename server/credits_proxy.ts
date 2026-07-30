// Typed game-server client for the external CREDITS economy service.
//
// CREDITS is a server-authoritative soft currency: ALL peg/price/balance logic
// and verification live in the economy service (a separate repo). The game NEVER
// computes any of it; this module is the game server's proxy to that service. The
// browser hits the game server, the game server hits the service over a
// secret-gated internal API.
//
// GRACEFUL DEGRADATION IS THE CONTRACT. If WOC_ECONOMY_SERVICE_URL or
// WOC_ECONOMY_INTERNAL_SECRET is unset, OR the service is unreachable / errors /
// times out, EVERY function here returns a typed "unavailable" result (balance
// null, empty skus, buy disabled) and NEVER throws up into request handling. The
// game must boot and play with the service OFF.
//
// The functions mirror the service SDK v1 surface; they do NOT recompute any
// value, they only pass through what the service returns.
//
// WIRE BOUNDARY (read this before renaming anything in this file): the currency
// was called "Claudium" until the Endless Glory rebrand; it now presents to
// players and to the rest of this repo as "Credits". The EXTERNAL economy
// service is a separate repo this project does not control, and it still emits
// and expects the literal JSON field name `claudium` (confirmed by reading its
// actual request/response shapes below). Every type or property access
// commented "WIRE:" reflects that service's byte-for-byte contract and must
// stay `claudium`, never `credits`, or this proxy silently stops parsing real
// responses. Everything else in this file - exported type/function names, and
// the field name this proxy hands to ITS OWN caller (server/credits.ts, and
// from there the browser) - is this repo's own naming and is renamed to
// `credits` throughout, mapped explicitly at each wire boundary below.

import { DESKTOP_WALLET_HANDOFF_TTL_MS, desktopWalletHandoffs } from './desktop_wallet_handoff';

const SERVICE_TIMEOUT_MS = 5000;
const NATIVE_CONFIRM_TIMEOUT_MS = 60_000;

/** Integer Credits balance for an account, or null when the service is off. */
export interface CreditsBalanceResult {
  available: boolean;
  balance: number | null;
}

/**
 * Per-rail price. usdPerCredit fixes the display peg (1 Credit = 0.01 USD);
 * wocBaseUnitsPerCredit is null when the WOC oracle is down (buy disabled on
 * the woc rail). Both fields null when the service is off.
 */
export interface CreditsPriceResult {
  rail: string;
  usdPerCredit: number | null;
  wocBaseUnitsPerCredit: string | null;
}

export interface CreditsNativePriceResult {
  rail: CreditsNativeRail;
  credits: number | null;
  amountBase: string | null;
  reason?: string;
}

export interface CreditsSolBalanceResult {
  owner: string;
  lamports: string | null;
}

export interface CreditsUsdcBalanceResult {
  owner: string;
  amountBase: string | null;
}

/** The raw /skus wire row. WIRE: `claudium` is the external service's own field
 *  name for the credited amount; kept literal here, mapped to `credits` below. */
interface EconomySkuWire {
  sku: string;
  usd: number;
  claudium: number;
  stripeConfigured?: boolean;
}

/** One rung of the SKU ladder, as this repo exposes it downstream. */
export interface CreditsSku {
  sku: string;
  usd: number;
  credits: number;
  stripeConfigured?: boolean;
}

/** The SKU ladder, empty when the service is off. */
export interface CreditsSkusResult {
  available: boolean;
  skus: CreditsSku[];
}

export type CreditsRail = 'stripe' | 'sol' | 'usdc' | 'woc';
export type CreditsPriceRail = 'stripe' | 'woc';
export type CreditsNativeRail = 'sol' | 'usdc' | 'woc';

/** The stripe-rail purchase-intent leg (client uses clientSecret with Stripe.js). */
export interface CreditsStripeIntent {
  clientSecret: string;
  publishableKey: string;
}

/**
 * The woc-rail purchase-intent leg: the split-transfer the client must build and
 * sign via the Wallet Standard path, then confirm by posting the signature.
 */
export interface CreditsWocIntent {
  amountBase: string;
  burnBase: string;
  treasuryBase: string;
  treasury: string;
  memo: string;
  expiresAtMs: number;
}

export interface CreditsPurchaseResult {
  ok: boolean;
  purchaseId: string | null;
  rail: CreditsRail | null;
  credits: number | null;
  stripe: CreditsStripeIntent | null;
  woc: CreditsWocIntent | null;
  reason: string | null;
}

export interface CreditsNativeRailsResult {
  available: boolean;
  rails: Record<CreditsNativeRail, boolean>;
}

export interface CreditsNativeQuoteResult {
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
  split: { burnBase: string; treasuryBase: string; treasury: string } | null;
  reason: string | null;
}

export interface CreditsNativeConfirmResult {
  settled: boolean;
  balance: number | null;
  reason: string | null;
}

export interface CreditsSpendResult {
  granted: boolean;
  balance: number | null;
  costCredits: number | null;
  reason: string | null;
}

export interface CreditsHistoryEntry {
  entryId: string;
  accountId: number;
  delta: number;
  reason: string;
  ref: string;
  atMs: number;
}

export interface CreditsHistoryResult {
  entries: CreditsHistoryEntry[];
}

/** One cosmetic-store row: the item and its Credits cost, both from the service. */
export interface CreditsStoreItem {
  itemId: string;
  name: string;
  kind: 'cosmetic' | 'skin' | 'item';
  costCredits: number;
  owned: boolean;
}

/** The cosmetic store catalog, empty when the service is off. */
export interface CreditsStoreResult {
  available: boolean;
  items: CreditsStoreItem[];
}

export interface CreditsStripeWebhookResult {
  received: boolean;
}

function serviceUrl(): string {
  return (process.env.WOC_ECONOMY_SERVICE_URL ?? '').trim();
}

function serviceSecret(): string {
  return process.env.WOC_ECONOMY_INTERNAL_SECRET ?? '';
}

/** The service is reachable only when BOTH the URL and the secret are set. */
export function creditsServiceConfigured(): boolean {
  return serviceUrl() !== '' && serviceSecret() !== '';
}

let loggedOnce = false;
function logFailure(err: unknown): void {
  // Dev-channel only; the request path never sees this. Log once so a persistently
  // down service does not flood the server log every request.
  if (loggedOnce) return;
  loggedOnce = true;
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[credits] economy service unavailable: ${message}`);
}

interface ServiceRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * The one fetch wrapper. Returns the parsed JSON on a 2xx, or null on any
 * failure (unconfigured, non-2xx, network error, timeout, bad JSON). It NEVER
 * throws: every caller maps a null into its own typed unavailable result.
 */
async function callService<T>(req: ServiceRequest): Promise<T | null> {
  const base = serviceUrl();
  const secret = serviceSecret();
  if (base === '' || secret === '') return null;
  try {
    const url = new URL(req.path.replace(/^\//, ''), base.endsWith('/') ? base : `${base}/`);
    const headers: Record<string, string> = { 'x-woc-economy-secret': secret };
    let body: string | undefined;
    if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }
    const res = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(req.timeoutMs ?? SERVICE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${req.method} ${req.path} -> ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    logFailure(err);
    return null;
  }
}

export async function creditsStripeWebhook(
  rawBody: Buffer,
  signatureHeader: string,
): Promise<CreditsStripeWebhookResult> {
  const base = serviceUrl();
  if (base === '') return { received: false };
  try {
    const url = new URL('stripe/webhook', base.endsWith('/') ? base : `${base}/`);
    const body = new Uint8Array(rawBody);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signatureHeader,
      },
      body,
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 400) throw new Error(`POST stripe/webhook -> ${res.status}`);
    const data = (await res.json()) as { received?: unknown };
    return { received: data.received === true };
  } catch (err) {
    logFailure(err);
    return { received: false };
  }
}

/** GET balance/:accountId. Balance null when the service is off. */
export async function creditsBalance(accountId: number): Promise<CreditsBalanceResult> {
  const data = await callService<{ balance: number }>({
    method: 'GET',
    path: `balance/${encodeURIComponent(String(accountId))}`,
  });
  const available = typeof data?.balance === 'number';
  return { available, balance: typeof data?.balance === 'number' ? data.balance : null };
}

/** GET price/:rail. Prices null when the service is off (buy disabled). */
export async function creditsPrice(rail: CreditsPriceRail): Promise<CreditsPriceResult> {
  // WIRE: usdPerClaudium / wocBaseUnitsPerClaudium are the external service's own
  // field names.
  const data = await callService<{
    rail: string;
    usdPerClaudium: number;
    wocBaseUnitsPerClaudium: string | number | null;
  }>({ method: 'GET', path: `price/${encodeURIComponent(rail)}` });
  if (!data) return { rail, usdPerCredit: null, wocBaseUnitsPerCredit: null };
  const wocBaseUnits = data.wocBaseUnitsPerClaudium;
  return {
    rail: data.rail,
    usdPerCredit: typeof data.usdPerClaudium === 'number' ? data.usdPerClaudium : null,
    wocBaseUnitsPerCredit:
      typeof wocBaseUnits === 'string'
        ? wocBaseUnits
        : typeof wocBaseUnits === 'number'
          ? String(wocBaseUnits)
          : null,
  };
}

export async function creditsNativePrice(
  rail: CreditsNativeRail,
  sku: string,
): Promise<CreditsNativePriceResult> {
  // WIRE: `claudium` is the external service's own field name for the credited
  // amount; read literally, exposed downstream as `credits`.
  const data = await callService<{
    rail?: CreditsNativeRail;
    claudium?: number;
    amountBase?: string | null;
    reason?: string;
  }>({
    method: 'GET',
    path: `native/price/${encodeURIComponent(rail)}?sku=${encodeURIComponent(sku)}`,
  });
  return {
    rail: data?.rail ?? rail,
    credits:
      typeof data?.claudium === 'number' && Number.isInteger(data.claudium) && data.claudium > 0
        ? data.claudium
        : null,
    amountBase: typeof data?.amountBase === 'string' ? data.amountBase : null,
    reason: data?.reason ?? (data ? undefined : 'unavailable'),
  };
}

export async function creditsSolBalance(owner: string): Promise<CreditsSolBalanceResult> {
  const data = await callService<{ owner?: string; lamports?: string | null }>({
    method: 'GET',
    path: `native/balance/sol/${encodeURIComponent(owner)}`,
  });
  return {
    owner: data?.owner ?? owner,
    lamports: typeof data?.lamports === 'string' ? data.lamports : null,
  };
}

export async function creditsUsdcBalance(owner: string): Promise<CreditsUsdcBalanceResult> {
  const data = await callService<{ owner?: string; amountBase?: string | null }>({
    method: 'GET',
    path: `native/balance/usdc/${encodeURIComponent(owner)}`,
  });
  return {
    owner: data?.owner ?? owner,
    amountBase: typeof data?.amountBase === 'string' ? data.amountBase : null,
  };
}

export async function creditsNativeRails(): Promise<CreditsNativeRailsResult> {
  const data = await callService<{ rails?: Partial<Record<CreditsNativeRail, boolean>> }>({
    method: 'GET',
    path: 'native/rails',
  });
  const available = data !== null && typeof data.rails === 'object' && data.rails !== null;
  return {
    available,
    rails: {
      sol: data?.rails?.sol === true,
      usdc: data?.rails?.usdc === true,
      woc: data?.rails?.woc === true,
    },
  };
}

/** GET skus. Empty ladder when the service is off (stripe rail disabled). */
export async function creditsSkus(): Promise<CreditsSkusResult> {
  const data = await callService<EconomySkuWire[]>({ method: 'GET', path: 'skus' });
  if (!Array.isArray(data)) return { available: false, skus: [] };
  const skus = data
    .filter(
      (s): s is EconomySkuWire =>
        typeof s?.sku === 'string' && typeof s.usd === 'number' && typeof s.claudium === 'number',
    )
    .map((s) => ({
      sku: s.sku,
      usd: s.usd,
      credits: s.claudium,
      stripeConfigured:
        typeof (s as { stripeConfigured?: unknown }).stripeConfigured === 'boolean'
          ? (s as { stripeConfigured: boolean }).stripeConfigured
          : undefined,
    }));
  return { available: true, skus };
}

/** POST purchase. Returns ok:false with a reason when the service is off. */
export async function creditsPurchase(input: {
  accountId: number;
  rail: 'stripe';
  sku: string;
  idempotencyKey: string;
}): Promise<CreditsPurchaseResult> {
  // WIRE: `claudium`/`woc` are the external service's own request/response field
  // names; read literally, exposed downstream as `credits`.
  const data = await callService<{
    purchaseId?: string;
    rail?: CreditsRail;
    claudium?: number;
    stripe?: CreditsStripeIntent;
    woc?: CreditsWocIntent;
    reason?: string;
  }>({ method: 'POST', path: 'purchase', body: input });
  if (!data) {
    return {
      ok: false,
      purchaseId: null,
      rail: null,
      credits: null,
      stripe: null,
      woc: null,
      reason: 'unavailable',
    };
  }
  const reason = typeof data.reason === 'string' ? data.reason : null;
  const purchaseId =
    typeof data.purchaseId === 'string' && data.purchaseId !== '' ? data.purchaseId : null;
  const rail =
    data.rail === 'stripe' || data.rail === 'sol' || data.rail === 'usdc' || data.rail === 'woc'
      ? data.rail
      : null;
  const credits =
    typeof data.claudium === 'number' && Number.isInteger(data.claudium) && data.claudium > 0
      ? data.claudium
      : null;
  const stripe =
    typeof data.stripe?.clientSecret === 'string' &&
    data.stripe.clientSecret.trim() !== '' &&
    typeof data.stripe.publishableKey === 'string' &&
    data.stripe.publishableKey.trim() !== ''
      ? {
          clientSecret: data.stripe.clientSecret,
          publishableKey: data.stripe.publishableKey,
        }
      : null;
  const ok =
    reason === null &&
    purchaseId !== null &&
    rail === input.rail &&
    credits !== null &&
    stripe !== null;
  if (!ok) {
    return {
      ok: false,
      purchaseId: null,
      rail: null,
      credits: null,
      stripe: null,
      woc: null,
      reason: reason ?? 'unavailable',
    };
  }
  return {
    ok: true,
    purchaseId,
    rail,
    credits,
    stripe,
    woc: null,
    reason: null,
  };
}

export async function creditsNativeQuote(input: {
  accountId: number;
  rail: CreditsNativeRail;
  sku: string;
  payer: string;
}): Promise<CreditsNativeQuoteResult> {
  // WIRE: `claudium` is the external service's own field name for the credited
  // amount; read literally, exposed downstream as `credits`.
  const data = await callService<{
    reference?: string;
    rail?: CreditsNativeRail;
    claudium?: number;
    amountBase?: string;
    destination?: string;
    mint?: string | null;
    memo?: string;
    quoteExpiryMs?: number;
    transactionBase64?: string;
    split?: { burnBase: string; treasuryBase: string; treasury: string };
    reason?: string;
  }>({
    method: 'POST',
    path: 'native/quote',
    body: {
      rail: input.rail,
      sku: input.sku,
      payer: input.payer,
      fulfillment: { kind: 'credit', accountId: input.accountId },
    },
  });
  const refusalReason = typeof data?.reason === 'string' ? data.reason : null;
  const creditedCredits =
    typeof data?.claudium === 'number' && Number.isInteger(data.claudium) && data.claudium > 0
      ? data.claudium
      : null;
  if (
    !data?.reference ||
    !data.transactionBase64 ||
    creditedCredits === null ||
    refusalReason !== null ||
    (data.rail !== undefined && data.rail !== input.rail)
  ) {
    return {
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
      reason: refusalReason ?? 'unavailable',
    };
  }
  const quoteExpiryMs =
    typeof data.quoteExpiryMs === 'number'
      ? data.quoteExpiryMs
      : Date.now() + DESKTOP_WALLET_HANDOFF_TTL_MS;
  try {
    desktopWalletHandoffs.authorizeTransaction(input.accountId, {
      reference: data.reference,
      transactionBase64: data.transactionBase64,
      expectedAddress: input.payer,
      rail: data.rail ?? input.rail,
      amountBase: data.amountBase ?? null,
      destination: data.destination ?? null,
      expiresAtMs: quoteExpiryMs,
    });
  } catch {
    return {
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
      reason: 'unavailable',
    };
  }
  return {
    ok: true,
    reference: data.reference,
    rail: data.rail ?? input.rail,
    credits: creditedCredits,
    amountBase: data.amountBase ?? null,
    destination: data.destination ?? null,
    mint: data.mint ?? null,
    memo: data.memo ?? null,
    quoteExpiryMs,
    transactionBase64: data.transactionBase64,
    split: data.split ?? null,
    reason: data.reason ?? null,
  };
}

export async function creditsNativeConfirm(input: {
  accountId: number;
  reference: string;
  signature: string;
}): Promise<CreditsNativeConfirmResult> {
  const data = await callService<{
    settled: boolean;
    reason?: string;
    fulfillment?: { balance?: number };
  }>({
    method: 'POST',
    path: 'native/confirm',
    body: input,
    timeoutMs: NATIVE_CONFIRM_TIMEOUT_MS,
  });
  if (!data) return { settled: false, balance: null, reason: 'unavailable' };
  return {
    settled: Boolean(data.settled),
    balance: typeof data.fulfillment?.balance === 'number' ? data.fulfillment.balance : null,
    reason: data.reason ?? null,
  };
}

/** POST spend. granted:false when the service is off. */
export async function creditsSpend(input: {
  accountId: number;
  itemId: string;
  kind: 'cosmetic' | 'skin' | 'item';
  expectedCostCredits: number;
  idempotencyKey: string;
}): Promise<CreditsSpendResult> {
  // WIRE: `costClaudium` is the external service's own request AND response field
  // name; the outbound body remaps `expectedCostCredits` back to it below, and
  // the response is read literally, exposed downstream as `costCredits`.
  const data = await callService<{
    granted: boolean;
    balance: number;
    costClaudium?: number;
    reason?: string;
  }>({
    method: 'POST',
    path: 'spend',
    body: {
      accountId: input.accountId,
      itemId: input.itemId,
      kind: input.kind,
      expectedCostClaudium: input.expectedCostCredits,
      idempotencyKey: input.idempotencyKey,
    },
  });
  if (!data) return { granted: false, balance: null, costCredits: null, reason: 'unavailable' };
  return {
    granted: Boolean(data.granted),
    balance: typeof data.balance === 'number' ? data.balance : null,
    costCredits: typeof data.costClaudium === 'number' ? data.costClaudium : null,
    reason: data.reason ?? null,
  };
}

/** GET history/:accountId. Empty when the service is off. */
export async function creditsHistory(accountId: number): Promise<CreditsHistoryResult> {
  const data = await callService<CreditsHistoryEntry[]>({
    method: 'GET',
    path: `history/${encodeURIComponent(String(accountId))}`,
  });
  if (!Array.isArray(data)) return { entries: [] };
  const entries = data.filter(
    (entry): entry is CreditsHistoryEntry =>
      typeof entry?.entryId === 'string' &&
      entry.accountId === accountId &&
      typeof entry.delta === 'number' &&
      typeof entry.reason === 'string' &&
      typeof entry.ref === 'string' &&
      typeof entry.atMs === 'number',
  );
  return { entries };
}

/** GET store. The cosmetic catalog, priced in Credits by the service. Empty when off. */
export async function creditsStore(accountId: number): Promise<CreditsStoreResult> {
  // WIRE: `costClaudium` is the external service's own field name; read
  // literally, exposed downstream as `costCredits`.
  const data = await callService<
    Array<{
      itemId?: unknown;
      name?: unknown;
      kind?: unknown;
      costClaudium?: unknown;
      owned?: unknown;
    }>
  >({
    method: 'GET',
    path: `store/${encodeURIComponent(String(accountId))}`,
  });
  if (!Array.isArray(data)) return { available: false, items: [] };
  const items: CreditsStoreItem[] = data
    .filter(
      (
        i,
      ): i is {
        itemId: string;
        name: string;
        kind: 'cosmetic' | 'skin' | 'item';
        costClaudium: number;
        owned: boolean;
      } =>
        typeof i?.itemId === 'string' &&
        typeof i.name === 'string' &&
        typeof i.costClaudium === 'number' &&
        typeof i.owned === 'boolean' &&
        (i.kind === 'cosmetic' || i.kind === 'skin' || i.kind === 'item'),
    )
    .map((i) => ({
      itemId: i.itemId,
      name: i.name,
      kind: i.kind,
      costCredits: i.costClaudium,
      owned: i.owned,
    }));
  return { available: true, items };
}
