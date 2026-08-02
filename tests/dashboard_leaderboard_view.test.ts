import { describe, expect, it } from 'vitest';
import { leaderboardPageModel, type XpLeaderboardRow } from '../src/dashboard/leaderboard_view';

describe('dashboard leaderboard view', () => {
  it('shows an empty state with no rows', () => {
    expect(leaderboardPageModel('xp', []).isEmpty).toBe(true);
  });

  it('passes rows through in the server-supplied rank order', () => {
    const rows: XpLeaderboardRow[] = [
      { rank: 1, name: 'Top', level: 60, lifetimeXp: 999 },
      { rank: 2, name: 'Second', level: 59, lifetimeXp: 950 },
    ];
    const model = leaderboardPageModel('xp', rows);
    expect(model.isEmpty).toBe(false);
    expect(model.rows).toEqual(rows);
  });

  it('tracks which tab is active without altering the row data', () => {
    expect(leaderboardPageModel('xp', []).activeTab).toBe('xp');
    expect(leaderboardPageModel('arena', []).activeTab).toBe('arena');
  });
});
