// Cloudflare Turnstile widget management, extracted from src/main.ts so both the
// game entry and the dashboard entry can gate their login/register forms on the
// same bot check without duplicating it. Api.login() and Api.register() both take
// a turnstileToken parameter, and the server enforces it in production
// (server/auth_routes.ts's injected passesTurnstile, skipped only when no secret
// is configured, i.e. dev/test). Without this, every dashboard login attempt
// would be rejected in production exactly as a bot's would.
//
// The api.js <script> tag must already be on the page (see index.html and
// dashboard.html); this module only drives the widget it exposes on window.

export interface TurnstileApi {
  render: (el: string | HTMLElement, opts: { sitekey: string }) => string;
  getResponse: (widgetId?: string) => string | undefined;
  reset: (widgetId?: string) => void;
}

function turnstileApi(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

/**
 * Per-entry widget state. Each entry (game, dashboard) calls ensureTurnstile
 * once with its own site key and container id; the returned handle tracks that
 * one widget's id so multiple entries never share state.
 */
export interface TurnstileHandle {
  widgetId: string | undefined;
}

/**
 * Render the widget once into `containerId`, retrying until the async api.js
 * script is ready. Safe to call repeatedly (idempotent) and a no-op when
 * `siteKey` is empty. Pass `skip = true` (the game's DESKTOP_APP case) to never
 * render: Cloudflare rejects non-http origins (widget error 110200), and the
 * server bypasses Turnstile for those origins server-side, so a widget there
 * could only wedge the form.
 */
export function ensureTurnstile(
  handle: TurnstileHandle,
  siteKey: string,
  containerId: string,
  skip = false,
): void {
  if (skip || !siteKey || handle.widgetId !== undefined) return;
  const ts = turnstileApi();
  const el = document.getElementById(containerId);
  if (!ts || !el) {
    window.setTimeout(() => ensureTurnstile(handle, siteKey, containerId, skip), 200);
    return;
  }
  handle.widgetId = ts.render(el, { sitekey: siteKey });
}

/**
 * The current single-use token, or '' when verification is not configured or
 * not yet solved. Tokens are consumed server-side, so callers reset after each
 * submit attempt via resetTurnstile.
 */
export function turnstileToken(siteKey: string, handle?: TurnstileHandle): string {
  const ts = turnstileApi();
  if (!siteKey || !ts || !handle || handle.widgetId === undefined) return '';
  return ts.getResponse(handle.widgetId) ?? '';
}

export function resetTurnstile(handle: TurnstileHandle): void {
  const ts = turnstileApi();
  if (ts && handle.widgetId !== undefined) ts.reset(handle.widgetId);
}
