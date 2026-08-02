// DOM half of the Collection page. Fetches the account's characters via the
// existing public characters() method, then pages deeds for the first one via
// the new characterDeeds() method (the dashboard shows one collection per
// account for now; a character switcher is a later refinement, not required
// by the spec).

import type { Api } from '../net/online';
import { userFacingApiError } from '../ui/api_error_i18n';
import { esc } from '../ui/esc';
import { t } from '../ui/i18n';
import { collectionPageModel, type EarnedDeed } from './collection_view';

export class CollectionPainter {
  private before: string | undefined;
  private accumulated: EarnedDeed[] = [];
  private characterId: number | undefined;

  constructor(
    private readonly container: HTMLElement,
    private readonly api: Api,
  ) {}

  async mount(): Promise<void> {
    this.container.innerHTML = '<div class="arc-card">...</div>';
    await this.loadPage();
  }

  private async loadPage(): Promise<void> {
    try {
      if (this.characterId === undefined) {
        const characters = await this.api.characters();
        if (characters.length === 0) {
          this.render(collectionPageModel([]));
          return;
        }
        this.characterId = characters[0].id;
      }
      const page = await this.api.characterDeeds(this.characterId, this.before);
      this.accumulated = [...this.accumulated, ...page];
      // The opaque cursor, not earnedAt: a same-timestamp batch grant (a
      // dungeon clear awarding several deeds at once) would otherwise let an
      // earnedAt-only cursor skip the rest of that cluster on the next page.
      if (page.length > 0) this.before = page[page.length - 1].cursor;
      this.render(collectionPageModel(this.accumulated));
    } catch (err) {
      this.renderError(userFacingApiError(err));
    }
  }

  private render(model: ReturnType<typeof collectionPageModel>): void {
    if (model.isEmpty) {
      this.container.innerHTML = `<div class="arc-card">${t('dashboard.collection.empty')}</div>`;
      return;
    }
    this.container.innerHTML = `
      <div class="arc-card">
        <h1 class="arc-title">${t('dashboard.collection.title')}</h1>
        <ul>${model.deeds.map((d) => `<li>${esc(d.deedId)}, ${esc(d.earnedAt)}</li>`).join('')}</ul>
        ${model.canLoadMore ? `<button id="dashboard-collection-more">${t('dashboard.collection.loadMore')}</button>` : ''}
      </div>
    `;
    this.container.querySelector('#dashboard-collection-more')?.addEventListener('click', () => {
      void this.loadPage();
    });
  }

  private renderError(message: string): void {
    this.container.innerHTML = `
      <div class="arc-card">
        <p>${message}</p>
        <button id="dashboard-collection-retry">${t('dashboard.error.retry')}</button>
      </div>
    `;
    this.container.querySelector('#dashboard-collection-retry')?.addEventListener('click', () => {
      void this.mount();
    });
  }
}
