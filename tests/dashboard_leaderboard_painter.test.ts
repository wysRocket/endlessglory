// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { LeaderboardPainter } from '../src/dashboard/leaderboard_painter';
import type { Api } from '../src/net/online';

describe('LeaderboardPainter tab-switch race', () => {
  it('discards a stale XP response that resolves after the player already switched to Arena', async () => {
    let resolveXp: ((entries: unknown[]) => void) | undefined;
    const fakeApi = {
      leaderboard: () =>
        new Promise((resolve) => {
          resolveXp = resolve;
        }),
      arenaLeaderboard: async () => [
        { name: 'Champ', class: 'warrior', level: 60, rating: 2000, wins: 10, losses: 2 },
      ],
    };

    const container = document.createElement('div');
    const painter = new LeaderboardPainter(container, fakeApi as unknown as Api);

    // Start the initial (XP) load; leave it pending on purpose.
    const mounted = painter.mount();

    // Simulate the player switching to Arena while the XP fetch above is
    // still in flight, without depending on button DOM lifecycle: this is
    // the exact race the guard-based version got wrong (this.tab flips
    // before the stale fetch resolves).
    (painter as unknown as { tab: string }).tab = 'arena';

    // Now the stale XP fetch resolves, arriving after the tab has moved on.
    resolveXp?.([
      { rank: 1, name: 'Top', level: 60, virtualLevel: 60, lifetimeXp: 999, prestigeRank: 0 },
    ]);
    await mounted;

    // The stale XP response must never have rendered: no XP row, and no
    // Arena data either yet (nothing re-fetched for the new tab from this
    // path), so the page should still show its loading placeholder.
    expect(container.textContent).not.toContain('Top');
    expect(container.querySelector('.arc-title')).toBeNull();
  });
});
