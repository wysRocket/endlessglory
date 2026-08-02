// DOM half of the Profile page. Fetches the account's characters via the shared
// Api instance's existing public characters() method and renders through
// profilePageModel.

import type { Api } from '../net/online';
import { userFacingApiError } from '../ui/api_error_i18n';
import { t } from '../ui/i18n';
import { profilePageModel } from './profile_view';

export class ProfilePainter {
  constructor(
    private readonly container: HTMLElement,
    private readonly api: Api,
  ) {}

  async mount(): Promise<void> {
    this.container.innerHTML = '<div class="arc-card">...</div>';
    try {
      const characters = await this.api.characters();
      this.render(profilePageModel(characters));
    } catch (err) {
      this.renderError(userFacingApiError(err));
    }
  }

  private render(model: ReturnType<typeof profilePageModel>): void {
    if (model.isEmpty) {
      this.container.innerHTML = `<div class="arc-card">${t('dashboard.profile.noCharacters')}</div>`;
      return;
    }
    this.container.innerHTML = `
      <div class="arc-card">
        <h1 class="arc-title">${t('dashboard.profile.title')}</h1>
        <ul>
          ${model.characters
            .map(
              (c) =>
                `<li>${c.name}, level ${c.level} ${c.class}${c.online ? ' (online)' : ''}</li>`,
            )
            .join('')}
        </ul>
      </div>
    `;
  }

  private renderError(message: string): void {
    this.container.innerHTML = `
      <div class="arc-card">
        <p>${message}</p>
        <button id="dashboard-profile-retry">${t('dashboard.error.retry')}</button>
      </div>
    `;
    this.container.querySelector('#dashboard-profile-retry')?.addEventListener('click', () => {
      void this.mount();
    });
  }
}
