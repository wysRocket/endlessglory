// Pure decision core for the Leaderboard page. Two tabs, XP and Arena, backed by
// GET /api/leaderboard and GET /api/arena/leaderboard respectively. Row shapes
// mirror src/world_api/progression_xp.ts's LeaderboardEntry and
// src/world_api/duel_arena.ts's ArenaLadderEntry, narrowed to what this page
// displays.

export interface XpLeaderboardRow {
  rank: number;
  name: string;
  level: number;
  lifetimeXp: number;
}

export interface ArenaLeaderboardRow {
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

export type LeaderboardTab = 'xp' | 'arena';

export interface LeaderboardPageModel<T> {
  activeTab: LeaderboardTab;
  isEmpty: boolean;
  rows: T[];
}

export function leaderboardPageModel<T>(tab: LeaderboardTab, rows: T[]): LeaderboardPageModel<T> {
  return { activeTab: tab, isEmpty: rows.length === 0, rows };
}
