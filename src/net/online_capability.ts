// Whether this build has an authoritative game server to talk to.
//
// Pure and host-agnostic (a Vitest drives it directly), the sibling of
// wallet_capability.ts: resolve the host capability BEFORE rendering a surface
// that depends on it.
//
// Why it exists: a static-only deployment (the client on a CDN with no game server
// behind it) answers 404 for every /api/* call, but still renders the login form. A
// player then completes Google sign-in successfully and the token exchange dies
// posting to /api/auth/firebase; password login has the same hole. Collecting
// credentials that nothing can accept is worse than offering nothing, so such a
// build declares itself with VITE_OFFLINE_ONLY=1 and the online surface is hidden.
//
// The decision is the OPERATOR'S DECLARATION and nothing else, deliberately:
//
//  - Not a runtime probe. A request-on-boot would add latency to every load and
//    still race the first click.
//  - Not inferred from the runtime (native/desktop/web) or from a configured API
//    origin. An earlier draft did infer it, and it was wrong: isDesktopAppRuntime()
//    is true inside Electron-based browsers, and the desktop shell's origin comes
//    from its preload bridge rather than any VITE_ var, so the inference disabled
//    login in the real desktop app. Whoever deploys knows whether a server exists;
//    guessing from the environment only invents ways to be wrong.

export interface OnlineCapabilityInput {
  /**
   * The raw VITE_OFFLINE_ONLY value. Read as a string rather than a boolean so the
   * one parsing rule ('1' after trimming, nothing else) lives here under test,
   * instead of being re-derived at each call site.
   */
  offlineOnlyFlag: string;
}

/** True when the online account surface (login, register, realms) can work. */
export function resolveOnlineCapability(input: OnlineCapabilityInput): boolean {
  return input.offlineOnlyFlag.trim() !== '1';
}
