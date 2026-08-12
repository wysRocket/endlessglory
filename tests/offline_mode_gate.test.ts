import { describe, expect, it } from 'vitest';
import { isOfflineModeAvailable, playCtaTarget } from '../src/game/offline_mode_gate';

describe('isOfflineModeAvailable', () => {
  it('is available under dev builds', () => {
    expect(isOfflineModeAvailable(true)).toBe(true);
  });

  it('is disabled in production builds', () => {
    expect(isOfflineModeAvailable(false)).toBe(false);
  });
});

describe('playCtaTarget', () => {
  // The regression this pins: #btn-offline is a hidden automation hook that
  // ships in production, so routing on its presence sent the production Play
  // button into the offline handler, which refuses to start when offline is
  // unavailable. The only CTA on the page did nothing.
  it('sends production players online even though the offline hook is present', () => {
    expect(playCtaTarget({ hasOfflineHook: true, offlineAvailable: false })).toBe('online');
  });

  it('keeps the local world for dev builds that expose offline', () => {
    expect(playCtaTarget({ hasOfflineHook: true, offlineAvailable: true })).toBe('offline');
  });

  it('goes online when the hook is absent, whatever availability says', () => {
    expect(playCtaTarget({ hasOfflineHook: false, offlineAvailable: true })).toBe('online');
    expect(playCtaTarget({ hasOfflineHook: false, offlineAvailable: false })).toBe('online');
  });
});
