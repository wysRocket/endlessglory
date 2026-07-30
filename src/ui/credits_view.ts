// Pure, host-agnostic view model for the CREDITS window.
//
// The pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference vendor_view.ts / stat_tooltip_view.ts). CREDITS is a
// server-authoritative soft currency: the peg, prices, SKU credits, balance, and
// purchase amounts ALL come from the economy service. This core recomputes NONE of
// them; it only projects the service payloads into the render rows and the
// per-rail availability the window paints. DOM-free and i18n-free so
// tests/credits_view.test.ts can drive it directly.
//
// The one non-negotiable: when the balance is null (the service is off) the model
// is a clean disabled/empty state, NEVER an error crash.

/** A price rung as returned by the service (usd + Credits credited). */
export interface CreditsSkuInput {
  sku: string;
  usd: number;
  credits: number;
  /** False when the Stripe price env var for this SKU is not configured. */
  stripeConfigured?: boolean;
}

export interface CreditsWalletBalancesInput {
  solLamports: string | null;
  usdcBaseUnits: string | null;
  wocBaseUnits: string | null;
}

export interface CreditsNativeSkuPriceInput {
  sku: string;
  solAmountBase?: string | null;
  usdcAmountBase?: string | null;
  wocAmountBase?: string | null;
}

/** The raw inputs, all sourced from the service via the SDK. */
export interface CreditsViewInput {
  /** Integer Credits balance, or null when the service is off. */
  balance: number | null;
  skus: readonly CreditsSkuInput[];
  nativeRails?: Partial<Record<'sol' | 'usdc' | 'woc', boolean>>;
  walletBalances?: CreditsWalletBalancesInput;
  nativePrices?: readonly CreditsNativeSkuPriceInput[];
}

/** One buy-picker row: the money label and the Credits credited, both from the service. */
export interface CreditsBuyRow {
  sku: string;
  usd: number;
  credits: number;
  stripeConfigured: boolean;
  solAffordable: boolean;
  usdcAffordable: boolean;
  wocAffordable: boolean;
  solAmountBase: string | null;
  usdcAmountBase: string | null;
  wocAmountBase: string | null;
}

/** Which purchase rails the window may enable. */
export interface CreditsRailAvailability {
  /** Stripe is available when there is at least one SKU rung to buy. */
  stripe: boolean;
  /** SOL is available when the native SOL rail is configured in the economy service. */
  sol: boolean;
  /** USDC is available when the stablecoin rail and SKU quote are both present. */
  usdc: boolean;
  /** WOC is available only when the oracle price (base units per Credits) is present. */
  woc: boolean;
}

export interface CreditsView {
  /** True when the service is off (balance null): render the disabled/empty state. */
  disabled: boolean;
  /** Whether a numeric balance is known (false in the disabled state). */
  hasBalance: boolean;
  /** The integer balance to render, or null in the disabled state. */
  balance: number | null;
  walletBalances: CreditsWalletBalancesInput;
  buyRows: CreditsBuyRow[];
  rails: CreditsRailAvailability;
  /** True when neither rail can transact (nothing to buy or oracle down + no skus). */
  buyDisabled: boolean;
}

/**
 * Pick the wallet address the window reads its crypto-rail balances from.
 *
 * The actively connected session wallet always wins. With nothing connected this
 * session, fall back to the account's server-verified LINKED wallet, so a
 * linked-but-disconnected player still sees live buy-button affordability (the
 * buy click then surfaces the existing "connect a wallet first" prompt to sign).
 * With neither, return null: the caller skips the balance reads entirely.
 */
export function creditsBalanceAddress(
  connectedAddress: string | null,
  linkedWalletPubkey: string | null,
): string | null {
  return connectedAddress ?? linkedWalletPubkey;
}

function affordable(balance: string | null | undefined, cost: string | null | undefined): boolean {
  if (!balance || !cost) return false;
  try {
    return BigInt(balance) >= BigInt(cost);
  } catch {
    return false;
  }
}

/**
 * Project the service payloads into the render model.
 *
 * Disabled state: a null balance means the service is off, so every buy row
 * is dropped and every rail is unavailable, a clean empty state (not an error).
 * Funded state: buy rows mirror the SKU ladder verbatim. Card is available when
 * its configured SKU ladder is non-empty; each native rail also requires a quote.
 */
export function buildCreditsView(input: CreditsViewInput): CreditsView {
  if (input.balance === null) {
    return {
      disabled: true,
      hasBalance: false,
      balance: null,
      walletBalances: { solLamports: null, usdcBaseUnits: null, wocBaseUnits: null },
      buyRows: [],
      rails: { stripe: false, sol: false, usdc: false, woc: false },
      buyDisabled: true,
    };
  }

  const balance = input.balance;
  const nativePriceBySku = new Map(input.nativePrices?.map((p) => [p.sku, p]) ?? []);
  const walletBalances = input.walletBalances ?? {
    solLamports: null,
    usdcBaseUnits: null,
    wocBaseUnits: null,
  };
  const buyRows: CreditsBuyRow[] = input.skus.map((s) => ({
    sku: s.sku,
    usd: s.usd,
    credits: s.credits,
    stripeConfigured: s.stripeConfigured !== false,
    solAmountBase: nativePriceBySku.get(s.sku)?.solAmountBase ?? null,
    usdcAmountBase: nativePriceBySku.get(s.sku)?.usdcAmountBase ?? null,
    wocAmountBase: nativePriceBySku.get(s.sku)?.wocAmountBase ?? null,
    solAffordable: affordable(
      walletBalances.solLamports,
      nativePriceBySku.get(s.sku)?.solAmountBase,
    ),
    usdcAffordable: affordable(
      walletBalances.usdcBaseUnits,
      nativePriceBySku.get(s.sku)?.usdcAmountBase,
    ),
    wocAffordable: affordable(
      walletBalances.wocBaseUnits,
      nativePriceBySku.get(s.sku)?.wocAmountBase,
    ),
  }));
  const stripe = buyRows.some((row) => row.stripeConfigured);
  const sol = input.nativeRails?.sol === true && buyRows.some((row) => row.solAmountBase !== null);
  const usdc =
    input.nativeRails?.usdc === true && buyRows.some((row) => row.usdcAmountBase !== null);
  const woc = input.nativeRails?.woc === true && buyRows.some((row) => row.wocAmountBase !== null);
  return {
    disabled: false,
    hasBalance: true,
    balance,
    walletBalances,
    buyRows,
    rails: { stripe, sol, usdc, woc },
    buyDisabled: !stripe && !sol && !usdc && !woc,
  };
}
