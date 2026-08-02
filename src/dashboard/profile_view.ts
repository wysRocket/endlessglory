// Pure decision core for the Profile page: given the account's characters, what
// to display. Reads the same shape src/net/online.ts's CharacterSummary already
// defines for the game's own character-select screen, narrowed to what the
// dashboard actually shows.

export interface ProfileCharacter {
  id: number;
  name: string;
  class: string;
  level: number;
  online: boolean;
}

export interface ProfilePageModel {
  isEmpty: boolean;
  characters: ProfileCharacter[];
}

export function profilePageModel(characters: ProfileCharacter[]): ProfilePageModel {
  const sorted = [...characters].sort((a, b) => b.level - a.level);
  return { isEmpty: sorted.length === 0, characters: sorted };
}
