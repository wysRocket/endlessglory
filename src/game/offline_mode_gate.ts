// Pure decision for whether the homepage offline mode entry points (the
// mode-select dropdown option and its #btn-offline compat trigger) may be
// used. Offline mode runs a local, unauthenticated Sim with no server
// authority, so it is a dev/local-testing convenience only: production
// builds must not expose it. `isDev` is meant to be `import.meta.env.DEV`,
// Vite's standard dev/production flag (true under `npm run dev`, false in a
// production `vite build`).
export function isOfflineModeAvailable(isDev: boolean): boolean {
  return isDev;
}

/** Where the single Play CTA sends a player on the landing page that has no
 *  realm dropdown.
 *
 *  This exists because the obvious wiring is wrong in a way that is invisible
 *  until production. `#btn-offline` is a HIDDEN legacy automation hook (see
 *  scripts/enter_offline_game.mjs) and ships in production too, so routing on
 *  "does that element exist" sent the production Play button into the offline
 *  handler, which refuses to start when offline is unavailable, leaving the
 *  only CTA on the page dead. Availability is the signal; the hook's presence
 *  is not. */
export function playCtaTarget(input: {
  /** Whether the hidden #btn-offline compat trigger is in the DOM. */
  hasOfflineHook: boolean;
  /** `isOfflineModeAvailable(...)` for this build. */
  offlineAvailable: boolean;
}): 'offline' | 'online' {
  return input.hasOfflineHook && input.offlineAvailable ? 'offline' : 'online';
}
