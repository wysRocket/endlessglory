import { describe, expect, it } from 'vitest';
import { collectionPageModel, type EarnedDeed } from '../src/dashboard/collection_view';

describe('dashboard collection view', () => {
  it('shows an empty state with no deeds', () => {
    const model = collectionPageModel([]);
    expect(model.isEmpty).toBe(true);
  });

  it('lists deeds newest first, as the server already returns them', () => {
    const deeds: EarnedDeed[] = [
      { deedId: 'first_blood', earnedAt: '2026-01-01T00:00:00Z', cursor: '2026-01-01T00:00:00Z_1' },
      {
        deedId: 'dungeon_delver',
        earnedAt: '2026-01-02T00:00:00Z',
        cursor: '2026-01-02T00:00:00Z_2',
      },
    ];
    const model = collectionPageModel(deeds);
    expect(model.isEmpty).toBe(false);
    expect(model.deeds).toEqual(deeds);
  });

  it('offers load-more only when a full page was returned', () => {
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      deedId: `deed_${i}`,
      earnedAt: '2026-01-01T00:00:00Z',
      cursor: `2026-01-01T00:00:00Z_${i}`,
    }));
    expect(collectionPageModel(fullPage, 20).canLoadMore).toBe(true);
    expect(collectionPageModel(fullPage.slice(0, 5), 20).canLoadMore).toBe(false);
  });
});
