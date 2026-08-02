// DOM half of the Leaderboard page. Fetches via the shared Api instance's
// existing public leaderboard() method (XP tab) and the new arenaLeaderboard()
// method (Arena tab) depending on the active tab. Both of these Api methods
// already swallow their own errors and return [] on failure (matching the
// game's own home-page leaderboard widget), so there is no thrown error for
// this painter to catch; an empty result renders through the pure core's own
// isEmpty state instead of a distinct error view.

import type { Api } from '../net/online';
import { esc } from '../ui/esc';
import { t } from '../ui/i18n';
import {
  type ArenaLeaderboardRow,
  type LeaderboardTab,
  leaderboardPageModel,
  type XpLeaderboardRow,
} from './leaderboard_view';

export class LeaderboardPainter {
  private tab: LeaderboardTab = 'xp';
  // Same in-flight guard CollectionPainter uses for its load-more button: a
  // second tab click while a fetch is still in flight is ignored rather than
  // racing a second load() (which could otherwise let a stale response for an
  // abandoned tab overwrite the tab the player switched to).
  private loading = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly api: Api,
  ) {}

  async mount(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      this.container.innerHTML = '<div class="arc-card">...</div>';
      if (this.tab === 'xp') {
        const entries = await this.api.leaderboard('global', 100);
        const rows: XpLeaderboardRow[] = entries.map((e) => ({
          rank: e.rank,
          name: e.name,
          level: e.level,
          lifetimeXp: e.lifetimeXp,
        }));
        this.renderXp(leaderboardPageModel('xp', rows));
      } else {
        const entries = await this.api.arenaLeaderboard(100);
        const rows: ArenaLeaderboardRow[] = entries.map((e) => ({
          name: e.name,
          rating: e.rating,
          wins: e.wins,
          losses: e.losses,
        }));
        this.renderArena(leaderboardPageModel('arena', rows));
      }
    } finally {
      this.loading = false;
    }
  }

  private tabs(): string {
    return `
      <div class="arc-card">
        <h1 class="arc-title">${t('dashboard.leaderboard.title')}</h1>
        <button data-tab="xp" ${this.tab === 'xp' ? 'disabled' : ''}>${t('dashboard.leaderboard.tabXp')}</button>
        <button data-tab="arena" ${this.tab === 'arena' ? 'disabled' : ''}>${t('dashboard.leaderboard.tabArena')}</button>
      </div>
    `;
  }

  private renderXp(model: ReturnType<typeof leaderboardPageModel<XpLeaderboardRow>>): void {
    this.container.innerHTML = `
      ${this.tabs()}
      <div class="arc-card">
        <ul>${model.rows.map((r) => `<li>${r.rank}. ${esc(r.name)}, level ${r.level}</li>`).join('')}</ul>
      </div>
    `;
    this.wireTabs();
  }

  private renderArena(model: ReturnType<typeof leaderboardPageModel<ArenaLeaderboardRow>>): void {
    this.container.innerHTML = `
      ${this.tabs()}
      <div class="arc-card">
        <ul>${model.rows.map((r) => `<li>${esc(r.name)}, ${r.rating} rating (${r.wins}-${r.losses})</li>`).join('')}</ul>
      </div>
    `;
    this.wireTabs();
  }

  private wireTabs(): void {
    this.container.querySelectorAll<HTMLButtonElement>('button[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab as LeaderboardTab;
        void this.load();
      });
    });
  }
}
