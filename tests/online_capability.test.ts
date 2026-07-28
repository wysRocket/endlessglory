// Whether a build has an authoritative game server to talk to
// (src/net/online_capability.ts).
//
// This exists because of a real failure: the endless-glory.vercel.app deployment
// serves the static client with NO game server behind it, so every /api/* call
// answers 404. The login form still rendered, so signing in with Google completed
// against Firebase and then died posting the token to /api/auth/firebase. Password
// login had the same hole and always did. Collecting credentials when nothing can
// accept them is worse than offering nothing.
import { describe, expect, it } from 'vitest';
import { resolveOnlineCapability } from '../src/net/online_capability';

describe('resolveOnlineCapability', () => {
  it('keeps the online surface on by default, so nothing changes for a real deployment', () => {
    expect(resolveOnlineCapability({ offlineOnlyFlag: '' })).toBe(true);
    expect(resolveOnlineCapability({ offlineOnlyFlag: '0' })).toBe(true);
  });

  it('drops the online surface when the build declares itself offline-only', () => {
    expect(resolveOnlineCapability({ offlineOnlyFlag: '1' })).toBe(false);
    expect(resolveOnlineCapability({ offlineOnlyFlag: ' 1 ' })).toBe(false);
  });

  // Fail OPEN on anything that is not exactly the opt-in value. Getting this
  // backwards would silently strip login from every real deployment on a typo,
  // which is a far worse failure than leaving the surface up on a static one.
  it('treats any other value as not opted in', () => {
    for (const value of ['true', 'yes', 'TRUE', '11', 'on', 'offline']) {
      expect(resolveOnlineCapability({ offlineOnlyFlag: value }), value).toBe(true);
    }
  });
});
