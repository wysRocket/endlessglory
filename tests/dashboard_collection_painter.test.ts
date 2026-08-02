// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CollectionPainter } from '../src/dashboard/collection_painter';
import type { EarnedDeed } from '../src/dashboard/collection_view';
import type { Api } from '../src/net/online';

function fullPage(prefix: string, size = 20): EarnedDeed[] {
  return Array.from({ length: size }, (_, i) => ({
    deedId: `${prefix}_${i}`,
    earnedAt: '2026-01-01T00:00:00.000Z',
    cursor: `2026-01-01T00:00:00.000Z_${prefix}_${i}`,
  }));
}

describe('CollectionPainter load-more race guard', () => {
  it('does not double-fetch when "Load more" fires twice before the first request resolves', async () => {
    let characterDeedsCalls = 0;
    let resolveSecondPage: ((deeds: EarnedDeed[]) => void) | undefined;
    const fakeApi = {
      characters: async () => [{ id: 1 }],
      characterDeeds: async () => {
        characterDeedsCalls += 1;
        if (characterDeedsCalls === 1) return fullPage('page1');
        // The second page never resolves until the test explicitly does so,
        // simulating an in-flight request a double-click would race against.
        return new Promise<EarnedDeed[]>((resolve) => {
          resolveSecondPage = resolve;
        });
      },
    };

    const container = document.createElement('div');
    const painter = new CollectionPainter(container, fakeApi as unknown as Api);
    await painter.mount();

    const button = container.querySelector<HTMLButtonElement>('#dashboard-collection-more');
    expect(button, 'Load more button must render after a full first page').not.toBeNull();

    // Simulate a double-click: fire the click twice synchronously, before the
    // second page's fetch has any chance to resolve.
    button?.dispatchEvent(new MouseEvent('click'));
    button?.dispatchEvent(new MouseEvent('click'));

    // Let any queued microtasks (the guard check, the fetch call) run.
    await Promise.resolve();
    await Promise.resolve();

    expect(characterDeedsCalls).toBe(2);

    resolveSecondPage?.(fullPage('page2'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.querySelectorAll('li')).toHaveLength(40);
  });
});
