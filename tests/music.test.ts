import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMusicThemes,
  dungeonMusicZoneForDungeon,
  MusicDirector,
  musicZoneForLocation,
  shouldResetMusicForDungeonEntry,
  THEME_TRIM,
} from '../src/game/music';

class FakeParam {
  value = 0;
  setTargetAtTime = vi.fn((value: number) => {
    this.value = value;
  });
}

class FakeNode {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeBufferSource extends FakeNode {
  static instances: FakeBufferSource[] = [];
  buffer: unknown = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    super();
    FakeBufferSource.instances.push(this);
  }
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  decodeAudioData = vi.fn(async () => ({ decoded: true }));
  createGain = vi.fn(() => new FakeGain());
  createDynamicsCompressor = vi.fn(() => ({
    ...new FakeNode(),
    threshold: new FakeParam(),
    knee: new FakeParam(),
    ratio: new FakeParam(),
    attack: new FakeParam(),
    release: new FakeParam(),
  }));
  createConvolver = vi.fn(() => ({ ...new FakeNode(), buffer: null }));
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));
  createBufferSource = vi.fn(() => new FakeBufferSource());
  resume = vi.fn(async () => undefined);
}

describe('MusicDirector — combat / background mix', () => {
  let director: MusicDirector;

  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('window', { setInterval: vi.fn(() => 1) });
    director = new MusicDirector();
    director.init();
  });

  afterEach(() => {
    clearInterval((director as unknown as { timer: number }).timer);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeBufferSource.instances = [];
  });

  const layers = () =>
    (
      director as unknown as {
        layers: Record<string, { target: number }>;
      }
    ).layers;

  it('plays the zone theme and no combat layer when out of combat', () => {
    director.update('vale', false);
    expect(layers().vale.target).toBe(1);
    expect(layers().combat.target).toBe(0);
  });

  it('silences the zone theme so ONLY combat music plays in combat (no layering)', () => {
    director.update('vale', false);
    director.update('vale', true);
    expect(layers().vale.target).toBe(0);
    expect(layers().combat.target).toBe(1);
  });

  it('restores the background theme and drops combat when combat ends', () => {
    director.update('vale', true);
    director.update('vale', false);
    expect(layers().vale.target).toBe(1);
    expect(layers().combat.target).toBe(0);
  });

  it('never runs the zone and combat layers at non-zero gain simultaneously', () => {
    for (const inCombat of [false, true, false, true]) {
      director.update('vale', inCombat);
      const zone = layers().vale.target;
      const combat = layers().combat.target;
      expect(Math.min(zone, combat)).toBe(0);
    }
  });
});

// The authored boss mp3 was removed with the rest of the upstream audio. What
// matters now is the INVERSE of the old pin: engaging boss combat must not fetch a
// track, and must no longer duck the procedural score to silence, or dungeon bosses
// would play nothing at all.
describe('MusicDirector boss combat without an authored track', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeBufferSource.instances = [];
  });

  it('never fetches an audio asset when boss combat engages', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { setInterval: vi.fn(() => 1) });

    const director = new MusicDirector();
    director.init();
    director.setBossCombat(true);
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeBufferSource.instances).toHaveLength(0);
  });

  it('keeps the procedural score audible through boss combat and the Sowfield', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('window', { setInterval: vi.fn(() => 1) });
    const director = new MusicDirector();
    director.init();
    const masterTarget = () =>
      (director as unknown as { masterTarget: () => number }).masterTarget();

    const base = masterTarget();
    expect(base).toBeGreaterThan(0);
    director.setBossCombat(true);
    expect(masterTarget()).toBe(base);
    director.setSowfieldTrack('match');
    expect(masterTarget()).toBe(base);
  });
});

describe('dungeon music entry reset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeBufferSource.instances = [];
  });

  it('resets only when entering a dungeon or changing dungeon instances', () => {
    expect(shouldResetMusicForDungeonEntry(null, 'nythraxis_boss_arena')).toBe(true);
    expect(shouldResetMusicForDungeonEntry('nythraxis_boss_arena', 'nythraxis_boss_arena')).toBe(
      false,
    );
    expect(shouldResetMusicForDungeonEntry('nythraxis_boss_arena', 'hollow_crypt')).toBe(true);
    expect(shouldResetMusicForDungeonEntry('nythraxis_boss_arena', null)).toBe(false);
  });

  it('rewinds the active dungeon layer on dungeon entry', () => {
    const director = new MusicDirector();
    const layer = { target: 1, anchor: 100, nextIdx: 7, loopCount: 3 };
    (director as unknown as { ctx: { currentTime: number } }).ctx = { currentTime: 42 };
    (director as unknown as { layers: Record<string, typeof layer> }).layers = {
      dungeon_hollow_crypt: layer,
    };

    director.resetForDungeonEntry('nythraxis_boss_arena');

    expect(dungeonMusicZoneForDungeon('nythraxis_boss_arena')).toBe('dungeon_hollow_crypt');
    expect(layer.nextIdx).toBe(-1);
    expect(layer.loopCount).toBe(0);
    expect(layer.anchor).toBe(42);
  });
});

describe('preserved Eastbrook Vale themes', () => {
  // The Eastbrook town, vale, and legacy vale compositions are frozen: their
  // note data must never drift while the rest of the soundtrack evolves.
  // If a change here is truly intended, recompute the checksum deliberately.
  it('keeps the original note data byte-identical', async () => {
    const { createHash } = await import('node:crypto');
    const themes = buildMusicThemes();
    const expected: Record<string, string> = {
      town_eastbrook: '0d3e5a4e6a209e42',
      vale: 'b9e65956ebe4b853',
      vale_legacy: '9caf3642610580dc',
    };
    for (const [name, hash] of Object.entries(expected)) {
      const actual = createHash('sha256')
        .update(JSON.stringify(themes[name]))
        .digest('hex')
        .slice(0, 16);
      expect(actual, `theme '${name}' note data changed`).toBe(hash);
    }
  });
});

describe('per-theme loudness trims', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('has an explicit measured trim for every registered theme', () => {
    for (const name of Object.keys(buildMusicThemes())) {
      expect(THEME_TRIM[name], `missing THEME_TRIM entry for '${name}'`).toBeGreaterThan(0);
      expect(THEME_TRIM[name], `implausible trim for '${name}'`).toBeLessThanOrEqual(4);
    }
  });

  it('drives layer gains through the measured trim, not bare 0/1', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('window', { setInterval: vi.fn(() => 1) });
    const director = new MusicDirector();
    director.init();
    const layers = (
      director as unknown as {
        layers: Record<string, { gain: { gain: { value: number } }; trim: number }>;
      }
    ).layers;
    director.update('vale', false);
    expect(layers.vale.gain.gain.value).toBeCloseTo(THEME_TRIM.vale);
    director.update('vale', true);
    expect(layers.combat.gain.gain.value).toBeCloseTo(THEME_TRIM.combat);
    expect(layers.vale.gain.gain.value).toBe(0);
    clearInterval((director as unknown as { timer: number }).timer);
  });
});

describe('world music zone selection', () => {
  it('plays the dedicated peaks anthem in the Thornpeak Heights overworld', () => {
    expect(musicZoneForLocation('thornpeak_heights', 'peaks', false, false)).toBe('peaks');
  });

  it('keeps the Thornpeak hub on the Highwatch town theme', () => {
    expect(musicZoneForLocation('thornpeak_heights', 'peaks', true, false)).toBe('town_highwatch');
  });
});
