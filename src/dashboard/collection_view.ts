// Pure decision core for the Collection page: given a page of earned deeds from
// GET /api/characters/:id/deeds (task 6), what to show, including whether more
// pages likely exist (a full page returned is the signal, matching the server's
// own DEEDS_PAGE_SIZE cap).

export interface EarnedDeed {
  deedId: string;
  earnedAt: string;
  cursor: string;
}

export interface CollectionPageModel {
  isEmpty: boolean;
  deeds: EarnedDeed[];
  canLoadMore: boolean;
}

export function collectionPageModel(deeds: EarnedDeed[], pageSize = 20): CollectionPageModel {
  return {
    isEmpty: deeds.length === 0,
    deeds,
    canLoadMore: deeds.length > 0 && deeds.length >= pageSize,
  };
}
