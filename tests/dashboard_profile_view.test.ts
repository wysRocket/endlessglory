import { describe, expect, it } from 'vitest';
import { type ProfileCharacter, profilePageModel } from '../src/dashboard/profile_view';

const CHAR: ProfileCharacter = {
  id: 1,
  name: 'Ashfang',
  class: 'warrior',
  level: 12,
  online: false,
};

describe('dashboard profile view', () => {
  it('shows an empty state with no characters', () => {
    const model = profilePageModel([]);
    expect(model.isEmpty).toBe(true);
    expect(model.characters).toHaveLength(0);
  });

  it('lists characters, highest level first', () => {
    const low: ProfileCharacter = { ...CHAR, id: 2, name: 'Lowbie', level: 3 };
    const model = profilePageModel([low, CHAR]);
    expect(model.isEmpty).toBe(false);
    expect(model.characters[0].name).toBe('Ashfang');
    expect(model.characters[1].name).toBe('Lowbie');
  });
});
