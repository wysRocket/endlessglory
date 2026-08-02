// The dashboard's auth gate and page nav. The gate decision itself is the pure
// resolveAuthGate function in ./auth_gate_core; this file is the DOM-touching
// shell that acts on it.

import { Api, isAuthError } from '../net/online';
import { t } from '../ui/i18n';
import { resolveAuthGate } from './auth_gate_core';
import { CollectionPainter } from './collection_painter';
import { LeaderboardPainter } from './leaderboard_painter';
import { LoginPainter } from './login_painter';
import { ProfilePainter } from './profile_painter';

type Page = 'profile' | 'collection' | 'leaderboard';

export class DashboardShell {
  private readonly api = new Api();
  private page: Page = 'profile';

  constructor(private readonly mount: HTMLElement) {}

  async start(): Promise<void> {
    const gate = await resolveAuthGate(this.api, isAuthError);
    if (gate === 'login') {
      this.renderLoginOnly();
      return;
    }
    this.renderShell();
  }

  private renderLoginOnly(): void {
    this.mount.innerHTML = '<div id="dashboard-login"></div>';
    const loginContainer = this.mount.querySelector<HTMLElement>('#dashboard-login');
    if (!loginContainer) return;
    new LoginPainter(loginContainer, this.api, () => void this.start()).mount();
  }

  private renderShell(): void {
    this.mount.innerHTML = `
      <nav class="arc-card" id="dashboard-nav">
        <button data-page="profile">${t('dashboard.nav.profile')}</button>
        <button data-page="collection">${t('dashboard.nav.collection')}</button>
        <button data-page="leaderboard">${t('dashboard.nav.leaderboard')}</button>
        <button id="dashboard-logout">${t('dashboard.nav.logout')}</button>
      </nav>
      <main id="dashboard-page"></main>
    `;
    const nav = this.mount.querySelector<HTMLElement>('#dashboard-nav');
    nav?.querySelectorAll<HTMLButtonElement>('button[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.page = btn.dataset.page as Page;
        this.renderPage();
      });
    });
    this.mount.querySelector('#dashboard-logout')?.addEventListener('click', () => {
      this.api.clearSession();
      void this.start();
    });
    this.renderPage();
  }

  private renderPage(): void {
    const el = this.mount.querySelector<HTMLElement>('#dashboard-page');
    if (!el) return;
    if (this.page === 'profile') new ProfilePainter(el, this.api).mount();
    else if (this.page === 'collection') new CollectionPainter(el, this.api).mount();
    else new LeaderboardPainter(el, this.api).mount();
  }
}
