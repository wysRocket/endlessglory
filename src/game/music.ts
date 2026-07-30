// Procedural adventure soundtrack: no audio files, pure WebAudio synthesis.
// Every cue is through-composed to modern JRPG dynamics: per-place leitmotifs
// grown from the zone's look and lore, layered ostinati, extended harmony,
// and multi-section forms (Eastbrook's Lantern Fair, Windward Reach over the
// vale, Mirefen's waterlogged requiem, Fenbridge's hearth lilt, Thornpeak's
// cold anthem, Highwatch's watch march, three dungeon crawls, and an A minor
// battle theme that transposes onto every zone key). The one holdover is
// `vale_legacy`: the original pre-expansion Eastbrook Vale theme, unreachable
// in play, kept only as an archival reference layer.
// Each theme is a composed multi-track loop scheduled with a lookahead
// timer; zone changes crossfade.

import type { BiomeId } from '../sim/types';
import { MUSIC_OVERRIDES } from './music_overrides.generated';

export type MusicZone =
  | 'town_eastbrook'
  | 'town_fenbridge'
  | 'town_highwatch'
  | 'vale'
  | 'vale_legacy'
  | 'marsh'
  | 'peaks'
  | 'vale_cup'
  | 'dungeon_hollow_crypt'
  | 'dungeon_sunken_bastion'
  | 'dungeon_gravewyrm_sanctum';

const TOWN_MUSIC: Record<string, MusicZone> = {
  eastbrook_vale: 'town_eastbrook',
  mirefen_marsh: 'town_fenbridge',
  thornpeak_heights: 'town_highwatch',
};

// Per-zone overworld overrides (empty: every zone plays its biome theme, so
// Thornpeak Heights gets the dedicated peaks anthem; vale_legacy remains
// available as a layer but is no longer routed anywhere).
const ZONE_MUSIC: Partial<Record<string, MusicZone>> = {};

const DUNGEON_MUSIC: Record<string, MusicZone> = {
  hollow_crypt: 'dungeon_hollow_crypt',
  sunken_bastion: 'dungeon_sunken_bastion',
  gravewyrm_sanctum: 'dungeon_gravewyrm_sanctum',
};

export function dungeonMusicZoneForDungeon(dungeonId: string): MusicZone {
  return DUNGEON_MUSIC[dungeonId] ?? 'dungeon_hollow_crypt';
}

export function shouldResetMusicForDungeonEntry(
  previousDungeonId: string | null,
  nextDungeonId: string | null,
): boolean {
  return nextDungeonId !== null && previousDungeonId !== nextDungeonId;
}

/** Pick the soundtrack layer from world position context. */
export function musicZoneForLocation(
  zoneId: string,
  biome: BiomeId,
  inHub: boolean,
  inDungeon: boolean,
  dungeonId: string | null = null,
): MusicZone {
  // Paint-only biomes (custom maps) borrow the closest shipped theme.
  const biomeMusic: MusicZone =
    biome === 'vale' || biome === 'marsh' || biome === 'peaks'
      ? biome
      : biome === 'beach'
        ? 'vale'
        : biome === 'cave'
          ? 'marsh'
          : 'peaks';
  if (inDungeon) return dungeonId ? dungeonMusicZoneForDungeon(dungeonId) : 'dungeon_hollow_crypt';
  if (inHub) return TOWN_MUSIC[zoneId] ?? biomeMusic;
  return ZONE_MUSIC[zoneId] ?? biomeMusic;
}

type Inst =
  | 'strings'
  | 'flute'
  | 'harp'
  | 'horn'
  | 'choir'
  | 'bell'
  | 'timpani'
  | 'bass'
  | 'stacc'
  | 'pad'
  | 'lute'
  | 'dulcimer'
  | 'frameDrum'
  | 'warDrum'
  | 'reed'
  | 'pipe'
  | 'squareLead'
  | 'woodBlock'
  | 'tinyBell'
  | 'piano'
  | 'shaker'
  | 'brassStab'
  | 'cymSwell'
  | 'oboe';

// Every synth voice, for tools (the music editor) that offer instrument
// choices. Keep in sync with the Inst union above.
export const INSTRUMENTS: Inst[] = [
  'strings',
  'flute',
  'harp',
  'horn',
  'choir',
  'bell',
  'timpani',
  'bass',
  'stacc',
  'pad',
  'lute',
  'dulcimer',
  'frameDrum',
  'warDrum',
  'reed',
  'pipe',
  'squareLead',
  'woodBlock',
  'tinyBell',
  'piano',
  'shaker',
  'brassStab',
  'cymSwell',
  'oboe',
];

export interface NoteEvent {
  beat: number; // quarter-note position in the loop
  midi: number;
  dur: number; // beats
  vel: number; // 0..1
  inst: Inst;
}

export interface Theme {
  bpm: number;
  bars: number; // 4/4
  events: NoteEvent[];
}

interface Layer {
  theme: Theme;
  gain: GainNode;
  target: number; // logical 0..1; the gain node gets target * trim
  anchor: number;
  nextIdx: number;
  loopCount: number;
  transpose: number;
  trim: number; // measured per-theme loudness trim (THEME_TRIM)
}

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

// ---------------------------------------------------------------------------
// Composition helpers
// ---------------------------------------------------------------------------

interface ChordDef {
  root: number; // midi (octave 4 area)
  minor?: boolean;
}

function triad(c: ChordDef): number[] {
  return [c.root, c.root + (c.minor ? 3 : 4), c.root + 7];
}

function pushNote(
  out: NoteEvent[],
  beat: number,
  midi: number,
  dur: number,
  vel: number,
  inst: Inst,
): void {
  out.push({ beat, midi, dur, vel, inst });
}

// melody phrases written as [beatOffset, midi, durBeats]
type Phrase = [number, number, number][];

function pushPhrase(
  out: NoteEvent[],
  startBeat: number,
  phrase: Phrase,
  vel: number,
  inst: Inst,
): void {
  for (const [b, m, d] of phrase) pushNote(out, startBeat + b, m, d, vel, inst);
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

function composeTownEastbrook(): Theme {
  const ev: NoteEvent[] = [];
  // "Lantern Fair". Bb major, 112 bpm: Eastbrook's market square strung with
  // lanterns every dusk, stalls out, the crowd's footwork underfoot. Bright
  // and bustling rather than the old quiet-pasture pastoral: a rippling
  // dulcimer ostinato and a reedy oboe crier's call carry the tune, bell and
  // brass-stab hits mark the stallkeepers, woodblock and frame drum keep the
  // crowd moving.
  const Bb = { root: 58 },
    F = { root: 65 },
    Gm = { root: 55, minor: true },
    Eb = { root: 63 };
  const Dm = { root: 62, minor: true };
  const chords: ChordDef[] = [Bb, F, Gm, Eb, Bb, Eb, F, Bb, Bb, Dm, Eb, Bb, Gm, Eb, F, Bb];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    // dulcimer ripple: bright rolling eighth-note arpeggio, root-3rd-5th-
    // octave and back
    const ripple = [t[0], t[1], t[2], t[0] + 12, t[2], t[1], t[0], t[1]];
    for (const [i, n] of ripple.entries()) {
      pushNote(ev, b0 + i * 0.5, n, 0.45, 0.26, 'dulcimer');
    }
    // low bass on 1 and 3
    pushNote(ev, b0, c.root - 24, 1.7, 0.34, 'bass');
    pushNote(ev, b0 + 2, c.root - 24, 1.7, 0.28, 'bass');
    // bell chord stab on the downbeat, an octave above the ripple's root
    pushVoicing(
      ev,
      b0,
      t.map((n) => n + 12),
      0.4,
      0.13,
      'bell',
    );
    // brass-stab punctuation in the back half of each 8-bar half
    if (bar % 8 >= 6) {
      pushVoicing(
        ev,
        b0 + 2,
        t.map((n) => n - 12),
        0.5,
        0.17,
        'brassStab',
      );
    }
    // crowd footwork: frame drum on the downbeat, woodblock on the offbeats
    pushDrumHits(ev, b0, [0], 'frameDrum', 0.17, 44);
    pushDrumHits(ev, b0, [1, 1.5, 2.5, 3, 3.5], 'woodBlock', 0.08, 76);
  });

  // A tune (oboe): the crier's call, a bright rising figure answered by a
  // skipping cadence
  const tuneA: Phrase = [
    [0, 70, 0.5],
    [0.5, 74, 0.5],
    [1, 77, 1],
    [2, 75, 0.5],
    [2.5, 74, 0.5],
    [3, 72, 1],
    [4, 70, 0.5],
    [4.5, 74, 0.5],
    [5, 77, 1.5],
    [6.5, 79, 0.5],
    [7, 77, 1],
    [8, 75, 0.5],
    [8.5, 77, 0.5],
    [9, 79, 1],
    [10, 81, 0.5],
    [10.5, 79, 0.5],
    [11, 77, 1],
    [12, 75, 1],
    [13, 74, 1],
    [14, 72, 2],
    [16, 70, 0.5],
    [16.5, 74, 0.5],
    [17, 77, 1],
    [18, 79, 0.5],
    [18.5, 77, 0.5],
    [19, 75, 1],
    [20, 77, 0.5],
    [20.5, 79, 0.5],
    [21, 81, 1.5],
    [22.5, 82, 0.5],
    [23, 81, 1],
    [24, 79, 1],
    [25, 77, 1],
    [26, 75, 2],
    [28, 77, 1],
    [29, 79, 1],
    [30, 81, 2],
  ];
  // B tune (oboe): the fair's high point, resolving down into the last cadence
  const tuneB: Phrase = [
    [0, 82, 1],
    [1, 81, 0.5],
    [1.5, 79, 0.5],
    [2, 77, 1],
    [3, 79, 1],
    [4, 82, 0.5],
    [4.5, 84, 0.5],
    [5, 84, 1],
    [6, 84, 1],
    [7, 82, 1],
    [8, 81, 1],
    [9, 79, 1],
    [10, 77, 1],
    [11, 75, 1],
    [12, 74, 1],
    [13, 77, 0.5],
    [13.5, 79, 0.5],
    [14, 81, 2],
    [16, 79, 0.5],
    [16.5, 77, 0.5],
    [17, 75, 1],
    [18, 77, 1],
    [19, 79, 1],
    [20, 81, 0.5],
    [20.5, 82, 0.5],
    [21, 84, 1.5],
    [22.5, 84, 0.5],
    [23, 84, 1],
    [24, 82, 1],
    [25, 79, 1],
    [26, 77, 2],
    [28, 74, 1],
    [29, 70, 3],
  ];
  pushPhrase(ev, 0, tuneA, 0.32, 'oboe');
  pushPhrase(ev, 32, tuneB, 0.32, 'oboe');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 112, bars: 16, events: ev };
}

function pushRepeated(
  out: NoteEvent[],
  startBeat: number,
  notes: number[],
  step: number,
  dur: number,
  vel: number,
  inst: Inst,
): void {
  for (const [i, m] of notes.entries()) {
    pushNote(out, startBeat + i * step, m, dur, vel, inst);
  }
}

function pushDrumHits(
  out: NoteEvent[],
  startBeat: number,
  offsets: number[],
  inst: Inst,
  vel: number,
  midi = 42,
): void {
  for (const [i, b] of offsets.entries()) {
    pushNote(out, startBeat + b, midi, 0.22, vel * (i % 2 === 0 ? 1 : 0.78), inst);
  }
}

function pushPedal(out: NoteEvent[], beat: number, root: number, inst: Inst, vel: number): void {
  pushNote(out, beat, root - 24, 4.1, vel, inst);
  pushNote(out, beat, root - 17, 4.1, vel * 0.62, inst);
}

// explicit chord voicing: absolute midi pitches sounded together
function pushVoicing(
  out: NoteEvent[],
  beat: number,
  midis: number[],
  dur: number,
  vel: number,
  inst: Inst,
): void {
  for (const m of midis) pushNote(out, beat, m, dur, vel, inst);
}

function composeTownFenbridge(): Theme {
  const ev: NoteEvent[] = [];
  // "The Fenward Hearth". C major, 100 bpm, 16 bars, bright and open.
  // Fenbridge is no longer a 12/8 G major lilt — this is a straight-ahead
  // C major greeting with a fingerpicked lute ostinato, a warm horn melody,
  // and a glockenspiel counterline. The garrison town gets an inviting,
  // slightly rustic theme that nods to the marsh from a safe distance:
  // no piano hearth chords, no walking bass, no triplets. A frame drum
  // taps on 2 and 4 like a village dance caller's stick.
  const C = { root: 60 },
    F = { root: 53 },
    G = { root: 55 },
    Am = { root: 57, minor: true };
  const Em = { root: 52, minor: true },
    Dm = { root: 50, minor: true };
  const chords: ChordDef[] = [C, F, C, G, Am, Em, F, G, C, Am, Dm, G, C, F, G, C];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 8;
    // fingerpicked lute: root, fifth then a higher arpeggio tail
    pushNote(ev, b0, t[0], 0.4, 0.24, 'lute');
    pushNote(ev, b0 + 0.5, t[2], 0.3, 0.15, 'lute');
    pushNote(ev, b0 + 1, t[1] + 12, 0.28, 0.13, 'lute');
    pushNote(ev, b0 + 1.5, t[2] + 12, 0.4, 0.12, 'lute');
    pushNote(ev, b0 + 2, t[0] + 12, 0.3, 0.14, 'lute');
    pushNote(ev, b0 + 3, t[2], 0.32, 0.12, 'lute');
    // bass: root half notes, no walking approach
    pushNote(ev, b0, c.root - 24, 1.8, 0.32, 'bass');
    pushNote(ev, b0 + 2, c.root - 17, 1.8, 0.24, 'bass');
    // frame drum on 2 and 4
    pushDrumHits(ev, b0, [1, 3], 'frameDrum', 0.14, 44);
    // soft string pad every two bars
    if (bar % 2 === 0) pushPedal(ev, b0, c.root, 'strings', 0.1);
    // glockenspiel trail on the back half
    if (late && bar % 2 === 1) pushNote(ev, b0 + 2.75, t[2] + 24, 0.5, 0.07, 'bell');
  });

  // A tune (horn): the welcoming call — rising fifths, skipping back down
  const tuneA: Phrase = [
    [0, 72, 0.5],
    [0.5, 76, 0.5],
    [1, 79, 1],
    [2, 77, 0.5],
    [2.5, 76, 0.5],
    [3, 72, 1],
    [4, 74, 0.5],
    [4.5, 76, 0.5],
    [5, 79, 1.5],
    [6.5, 77, 0.5],
    [7, 76, 1],
    [8, 72, 0.5],
    [8.5, 74, 0.5],
    [9, 76, 1],
    [10, 79, 1],
    [11, 81, 1],
    [12, 80, 0.5],
    [12.5, 79, 0.5],
    [13, 77, 1],
    [14, 76, 0.5],
    [14.5, 74, 0.5],
    [15, 72, 1],
    [16, 74, 0.5],
    [16.5, 76, 0.5],
    [17, 79, 1],
    [18, 77, 0.5],
    [18.5, 76, 0.5],
    [19, 74, 1],
    [20, 72, 1],
    [21, 74, 1],
    [22, 76, 2],
    [24, 79, 0.5],
    [24.5, 81, 0.5],
    [25, 84, 1.5],
    [26.5, 83, 0.5],
    [27, 81, 1],
    [28, 79, 1.5],
    [29.5, 77, 0.5],
    [30, 72, 2],
  ];
  pushPhrase(ev, 0, tuneA, 0.26, 'horn');
  // B part: a gentler answer on the oboe, answered in canon by the lute
  const tuneB: Phrase = [
    [0, 77, 1],
    [1, 79, 1],
    [2, 81, 1.5],
    [3.5, 79, 0.5],
    [4, 77, 1],
    [5, 74, 1],
    [6, 72, 2],
    [8, 76, 1],
    [9, 79, 1],
    [10, 77, 1.5],
    [11.5, 76, 0.5],
    [12, 74, 1],
    [13, 72, 1],
    [14, 71, 2],
    [16, 72, 0.5],
    [16.5, 74, 0.5],
    [17, 76, 1],
    [18, 79, 1],
    [19, 77, 1],
    [20, 76, 1.5],
    [21.5, 74, 0.5],
    [22, 72, 2],
  ];
  pushPhrase(ev, 32, tuneB, 0.22, 'oboe');
  // lute canon a third below
  pushPhrase(
    ev,
    32,
    tuneB.map(([b, m, d]) => [b, m - 4, d] as Phrase[number]),
    0.1,
    'lute',
  );
  // reprise: horn, then a soft descant on bell
  pushPhrase(ev, 64, tuneA, 0.24, 'horn');
  pushPhrase(
    ev,
    64,
    tuneA.map(([b, m, d]) => [b, m + 12, d] as Phrase[number]),
    0.06,
    'bell',
  );

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 100, bars: 24, events: ev };
}

function composeTownHighwatch(): Theme {
  const ev: NoteEvent[] = [];
  // "Citadel at Dusk". E minor, 90 bpm, 16 bars. Highwatch is no longer a
  // B minor horn chorale march — this is a mysterious, grand theme in pure
  // E aeolian, written for deep bells, a weaving woodwind line, and a
  // low pulse from the war drum that suggests the weight of stone overhead.
  // No strings sustain, no piano hearth, no parade drum flourishes. The
  // A section circles a three-note descending motto (E-D-C); the B section
  // lifts unexpectedly into G major before the dusk-bell returns.
  const Em = { root: 52, minor: true },
    G = { root: 55 },
    D = { root: 62 },
    Am = { root: 57, minor: true };
  const C = { root: 60 },
    Bm = { root: 59, minor: true };
  const chords: ChordDef[] = [Em, G, D, Am, Em, C, G, D, Am, Em, Bm, C, G, Am, D, Em];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 8;
    // deep bell: root, fifth, octave sustained every two bars
    if (bar % 2 === 0) {
      pushVoicing(ev, b0, [t[0] - 12, t[2] - 12, t[0]], 4.05, 0.13, 'bell');
      pushNote(ev, b0, c.root - 24, 4.1, 0.3, 'bass');
    } else {
      pushNote(ev, b0, c.root - 12, 4.1, 0.22, 'bass');
    }
    // war drum: slow pulse on 1 and 3, like a heartbeat heard through stone
    pushNote(ev, b0, 38, 0.9, late ? 0.2 : 0.14, 'warDrum');
    pushNote(ev, b0 + 2, 38, 0.9, 0.12, 'warDrum');
    // reed: a quiet weaving counterline half a beat off the pulse
    if (bar % 2 === 1) pushNote(ev, b0 + 0.5, t[1] + 12, 0.8, 0.08, 'reed');
    if (late && bar % 2 === 0) {
      // a second bell tolls in the back half, an octave higher
      pushNote(ev, b0 + 2.5, t[2] + 12, 1.2, 0.05, 'tinyBell');
    }
  });

  // A motto (reed and oboe in octaves): the citadel's three-note descent
  const motto: Phrase = [
    [0, 64, 0.5],
    [0.5, 62, 0.5],
    [1, 60, 0.5],
    [1.5, 62, 0.5],
    [2, 64, 1],
    [3, 67, 1],
    [4, 69, 0.5],
    [4.5, 67, 0.5],
    [5, 64, 1.5],
    [6.5, 62, 0.5],
    [7, 60, 1],
    [8, 64, 0.5],
    [8.5, 67, 0.5],
    [9, 69, 1],
    [10, 71, 1],
    [11, 72, 1],
    [12, 71, 1],
    [13, 69, 1],
    [14, 67, 2],
    [16, 64, 0.5],
    [16.5, 67, 0.5],
    [17, 69, 0.5],
    [17.5, 71, 0.5],
    [18, 72, 1],
    [19, 74, 1],
    [20, 72, 0.5],
    [20.5, 71, 0.5],
    [21, 69, 1],
    [22, 67, 1],
    [23, 64, 1],
    [24, 62, 0.5],
    [24.5, 60, 0.5],
    [25, 62, 1],
    [26, 64, 1.5],
    [27.5, 67, 0.5],
    [28, 64, 3],
  ];
  pushPhrase(ev, 0, motto, 0.22, 'reed');
  pushPhrase(ev, 0, motto.map(([b, m, d]) => [b, m + 12, d] as Phrase[number]), 0.12, 'oboe');
  // B section: G major lift — the view from the wall at sunset
  const lift: Phrase = [
    [0, 76, 1],
    [1, 79, 0.5],
    [1.5, 81, 0.5],
    [2, 83, 1.5],
    [3.5, 81, 0.5],
    [4, 79, 1],
    [5, 76, 0.5],
    [5.5, 74, 0.5],
    [6, 79, 2],
    [8, 81, 1],
    [9, 83, 1],
    [10, 81, 1.5],
    [11.5, 79, 0.5],
    [12, 76, 1],
    [13, 74, 0.5],
    [13.5, 72, 0.5],
    [14, 71, 1.5],
    [15.5, 69, 0.5],
    [16, 72, 1],
    [17, 76, 1],
    [18, 79, 2],
    [20, 77, 0.5],
    [20.5, 76, 0.5],
    [21, 74, 1],
    [22, 72, 1],
    [23, 71, 1],
    [24, 72, 1.5],
    [25.5, 71, 0.5],
    [26, 72, 1.5],
    [27.5, 74, 0.5],
    [28, 76, 3.5],
  ];
  pushPhrase(ev, 36, lift, 0.16, 'flute');
  // reprise: the motto returns, the oboe above the reed
  pushPhrase(ev, 68, motto, 0.2, 'reed');
  pushPhrase(
    ev,
    68,
    motto.map(([b, m, d]) => [b, m + 12, d] as Phrase[number]),
    0.1,
    'oboe',
  );

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 90, bars: 24, events: ev };
}

function composeVale(): Theme {
  const ev: NoteEvent[] = [];
  // "The Bend in the Road". G lydian, 84 bpm, 16 bars. Eastbrook Vale's open
  // wilderness is no longer an A dorian loop — this is a forward-pressing
  // travel theme in G lydian, the raised fourth (C#) giving every phrase a
  // wanderlust lift. A pizzicato violin trio carries the motive over a
  // walking acoustic bass and a gentle shaker pulse; the B section opens
  // into a harmonised string chorale before the road bends back.
  const G = { root: 55 },
    D = { root: 62 },
    C = { root: 60 },
    Em = { root: 52, minor: true },
    Am = { root: 57, minor: true };
  const chords: ChordDef[] = [G, D, Em, C, G, C, Am, D, G, Em, Am, C, G, D, Am, G];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 8;
    // walking bass: root on 1, fifth or third on 3, approach into next bar
    pushNote(ev, b0, c.root - 24, 1.2, 0.32, 'bass');
    pushNote(ev, b0 + 2, c.root - 17, 1.0, 0.22, 'bass');
    pushNote(ev, b0 + 3.5, (chords[(bar + 1) % chords.length] as ChordDef).root - 26, 0.4, 0.15, 'bass');
    // violin pizzicato trio: root, fifth, octave plucked on the downbeat
    pushVoicing(ev, b0, [t[0], t[2], t[0] + 12], 0.3, late ? 0.18 : 0.14, 'stacc');
    if (bar % 2 === 1) pushVoicing(ev, b0 + 2, [t[1] + 12, t[2] + 12], 0.3, 0.11, 'stacc');
    // soft shaker and frame drum for the road rhythm
    pushDrumHits(ev, b0, [0.5, 1, 2, 2.5, 3, 3.5], 'shaker', 0.1, 72);
    if (bar % 4 === 0 || bar % 4 === 2) pushDrumHits(ev, b0, [0, 2], 'frameDrum', 0.08, 44);
    // distant pad wash
    if (bar % 4 === 0) pushPedal(ev, b0, c.root + 12, 'strings', 0.08);
    // dulcimer trail on the last beat of every other bar
    if (bar % 2 === 1) pushNote(ev, b0 + 3.25, t[2] + 24, 0.5, 0.07, 'dulcimer');
  });

  // A section: the wanderer's motive on pizzicato strings
  const motive: Phrase = [
    [0, 67, 0.5],
    [0.5, 71, 0.5],
    [1, 74, 1],
    [2, 72, 0.5],
    [2.5, 71, 0.5],
    [3, 67, 1],
    [4, 66, 0.5],
    [4.5, 67, 0.5],
    [5, 71, 1],
    [6, 72, 0.5],
    [6.5, 74, 0.5],
    [7, 76, 1],
    [8, 78, 0.5],
    [8.5, 76, 0.5],
    [9, 74, 1],
    [10, 72, 0.5],
    [10.5, 71, 0.5],
    [11, 67, 1],
    [12, 71, 0.5],
    [12.5, 74, 0.5],
    [13, 76, 1],
    [14, 74, 0.5],
    [14.5, 72, 0.5],
    [15, 71, 1],
  ];
  pushPhrase(ev, 4, motive, 0.22, 'stacc');
  // B section: a warm chorale that lifts onto the dominant
  const chorale: Phrase = [
    [0, 74, 1.5],
    [1.5, 76, 0.5],
    [2, 78, 1],
    [3, 74, 1],
    [4, 79, 1],
    [5, 78, 0.5],
    [5.5, 76, 0.5],
    [6, 74, 1.5],
    [7.5, 71, 0.5],
    [8, 72, 1],
    [9, 76, 1],
    [10, 79, 1.5],
    [11.5, 78, 0.5],
    [12, 78, 1],
    [13, 76, 1],
    [14, 74, 2.5],
  ];
  pushPhrase(ev, 36, chorale, 0.18, 'strings');
  // reprise with a soft dulcimer descant
  pushPhrase(ev, 52, motive, 0.2, 'stacc');
  pushPhrase(ev, 54, motive.slice(2).map(([b, m, d]) => [b - 2, m + 12, d] as Phrase[number]), 0.07, 'dulcimer');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 84, bars: 16, events: ev };
}

function composeLegacyVale(): Theme {
  const ev: NoteEvent[] = [];
  // Original Eastbrook Vale wilderness theme from before the per-zone soundtrack expansion.
  const Am = { root: 57, minor: true },
    C = { root: 60 },
    G = { root: 55 };
  const Em = { root: 52, minor: true },
    Dmaj = { root: 62 },
    F = { root: 53 };
  const chords: ChordDef[] = [Am, Am, C, G, Am, Em, G, Am, Am, C, Dmaj, Am, F, C, Em, Am];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    if (bar % 2 === 0) {
      pushNote(ev, b0, c.root - 24, 8.4, 0.4, 'strings');
      pushNote(ev, b0, c.root - 17, 8.4, 0.26, 'strings');
    }
    for (const n of t) pushNote(ev, b0, n - 12, 4.05, 0.16, 'choir');
    pushNote(ev, b0, c.root - 12, 1.5, 0.3, 'bass');
    if (bar % 4 === 1) pushNote(ev, b0 + 2, c.root - 5, 1.8, 0.24, 'bass');
    if (bar % 4 === 3) pushNote(ev, b0 + 2.5, c.root - 10, 1.4, 0.22, 'bass');
    if (bar % 4 === 2) {
      for (const [i, n] of [t[2], t[0] + 12, t[1] + 12].entries()) {
        pushNote(ev, b0 + 1 + i * 0.5, n, 0.5, 0.2, 'harp');
      }
    }
  });

  const motifs: [number, Phrase][] = [
    [
      4,
      [
        [0, 69, 1],
        [1, 71, 1],
        [2, 72, 1.5],
        [3.5, 71, 0.5],
        [4, 67, 2],
        [6, 64, 2],
      ],
    ],
    [
      20,
      [
        [0, 76, 1.5],
        [1.5, 74, 0.5],
        [2, 72, 1],
        [3, 71, 1],
        [4, 69, 3],
      ],
    ],
    [
      36,
      [
        [0, 72, 1],
        [1, 74, 1],
        [2, 76, 1.5],
        [3.5, 74, 0.5],
        [4, 72, 1],
        [5, 69, 1],
        [6, 71, 3],
      ],
    ],
    [
      52,
      [
        [0, 69, 1],
        [1, 72, 1],
        [2, 71, 1],
        [3, 67, 1],
        [4, 69, 4],
      ],
    ],
  ];
  for (const [start, ph] of motifs) pushPhrase(ev, start, ph, 0.26, 'flute');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 66, bars: 16, events: ev };
}

function composeMarsh(): Theme {
  const ev: NoteEvent[] = [];
  // "Fogbound". E locrian, 72 bpm, 24 bars. Mirefen is no longer a
  // waterlogged E aeolian requiem — this is a desolate, dry-reed dirge in
  // E locrian, the flattened second (F natural) turning every iv into a
  // minor-second shiver. No piano droplets, no choir of the drowned, no
  // B-section lift into G major. Instead: a single low reed wail against
  // a drone pipe, frame drum rattles that sound like stones falling into
  // still water, and a muted brass stab for the marsh's buried secrets.
  // The fog never lifts.
  const Em = { root: 52, minor: true },
    F = { root: 53 },
    Dm = { root: 50, minor: true };
  const Bb = { root: 58 },
    Gm = { root: 55, minor: true };
  const chords: ChordDef[] = [Em, F, Em, Dm, Em, F, Gm, Em, Dm, Em, F, Em, Bb, F, Dm, Em, Em, F, Gm, Em, Dm, F, Em, Em];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 12;
    // drone: the tonic E never wavers, a pipe holding the same note forever
    pushNote(ev, b0, 52, 8.2, late ? 0.12 : 0.08, 'pipe');
    // bass: slow, with a shiver on the downbeat of the F bars
    pushNote(ev, b0, c.root - 24, 2.8, 0.26, 'bass');
    if (bar % 2 === 1) pushNote(ev, b0 + 2, c.root - 17, 1.2, 0.16, 'bass');
    // the minor-second: on F bars the flat second rings over the pedal
    if (c.root === 53) pushVoicing(ev, b0, [52, 53], 4.05, 0.07, 'strings');
    // stones: frame drum rattle off the grid
    if (bar % 3 === 0) pushDrumHits(ev, b0, [1.25, 2.75, 3.5], 'frameDrum', 0.08, 42);
    // muted brass stab in the second half
    if (late && bar % 4 === 0) pushVoicing(ev, b0, [t[0] - 12, t[2] - 12], 0.6, 0.14, 'brassStab');
    // wood click, irregular
    if (bar % 5 === 2) pushNote(ev, b0, 70, 0.2, 0.05, 'woodBlock');
  });

  // Dirge (reed): a single wailing line over the drone, no counterpoint
  const dirge: Phrase = [
    [0, 64, 2],
    [2, 63, 1],
    [3, 64, 1],
    [4, 67, 1.5],
    [5.5, 64, 0.5],
    [6, 62, 2],
    [8, 63, 1.5],
    [9.5, 64, 0.5],
    [10, 67, 1],
    [11, 63, 1],
    [12, 62, 2],
    [14, 58, 1],
    [15, 60, 1],
    [16, 62, 1.5],
    [17.5, 63, 0.5],
    [18, 64, 2],
    [20, 63, 1],
    [21, 60, 1],
    [22, 62, 2.5],
    [25, 58, 2],
    [27, 55, 1],
    [28, 57, 3],
  ];
  pushPhrase(ev, 8, dirge, 0.2, 'reed');
  // second dirge: the same line, an octave up and a half bar behind
  pushPhrase(
    ev,
    16,
    dirge.map(([b, m, d]) => [b + 0.5, m + 12, d] as Phrase[number]),
    0.09,
    'oboe',
  );
  // reprise: the first dirge alone again, fading
  pushPhrase(ev, 72, dirge.map(([b, m, d]) => [b, m, d * 0.9] as Phrase[number]), 0.16, 'reed');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 72, bars: 24, events: ev };
}

function composePeaks(): Theme {
  const ev: NoteEvent[] = [];
  // "Above the Clouds". F lydian, 108 bpm, 20 bars. Thornpeak is no longer a
  // D major anthem march — this is light, thin-air wonder in F lydian, the
  // raised fourth (B natural) giving every melodic turn an alpine shimmer.
  // No horn chorale, no war drums, no marching ostinato. Instead: a rippling
  // dulcimer arpeggio that never stops, a flute line that soars and dives
  // like a hawk riding thermals, and a delicate bell toll for the summit.
  // The B section drops into the relative D minor for a moment of vertigo
  // before the wind lifts the theme back.
  const F = { root: 53 },
    C = { root: 60 },
    Dm = { root: 50, minor: true };
  const Bb = { root: 58 },
    Gm = { root: 55, minor: true },
    Am = { root: 57, minor: true };
  const chords: ChordDef[] = [F, C, Dm, Bb, F, C, Gm, Am, Dm, C, Bb, F, Dm, Gm, Am, F, C, Bb, C, F];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 10;
    // dulcimer: constant eighth-note ripple, like light on snow
    const ripple = [t[0], t[1], t[2], t[0] + 12, t[2], t[1], t[0], t[1]];
    for (const [i, n] of ripple.entries()) {
      pushNote(ev, b0 + i * 0.5, n + 12, 0.28, 0.15, 'dulcimer');
    }
    // bass: light and skipping, not heavy
    pushNote(ev, b0, c.root - 24, 1.0, 0.26, 'bass');
    pushNote(ev, b0 + 2, c.root - 17, 0.8, 0.16, 'bass');
    pushNote(ev, b0 + 3, c.root - 12, 0.6, 0.12, 'bass');
    // tiny bell chord on the downbeat of the early bars
    if (bar % 2 === 0 && !late) pushVoicing(ev, b0, [t[0] + 24, t[2] + 24], 0.6, 0.06, 'tinyBell');
    // soft shaker for the thin wind
    pushDrumHits(ev, b0, [0.5, 1.5, 2.5, 3.5], 'shaker', 0.06, 72);
    // frame drum on 2 and 4 in the back half
    if (late) pushDrumHits(ev, b0, [1, 3], 'frameDrum', 0.08, 44);
    // sustained choir pad every 4 bars
    if (bar % 4 === 0) pushPedal(ev, b0, c.root + 12, 'choir', 0.06);
  });

  // A: the soaring flute melody — wide intervals, rising and falling
  const soar: Phrase = [
    [0, 74, 0.5],
    [0.5, 77, 0.5],
    [1, 81, 1],
    [2, 79, 0.5],
    [2.5, 77, 0.5],
    [3, 74, 1],
    [4, 72, 0.5],
    [4.5, 74, 0.5],
    [5, 77, 1],
    [6, 81, 0.5],
    [6.5, 84, 0.5],
    [7, 86, 1],
    [8, 84, 0.5],
    [8.5, 81, 0.5],
    [9, 77, 1.5],
    [10.5, 74, 0.5],
    [11, 72, 1],
    [12, 77, 0.5],
    [12.5, 81, 0.5],
    [13, 84, 1],
    [14, 81, 0.5],
    [14.5, 79, 0.5],
    [15, 77, 1],
    [16, 79, 0.5],
    [16.5, 81, 0.5],
    [17, 84, 1],
    [18, 86, 1],
    [19, 84, 1],
    [20, 81, 2],
    [22, 79, 1],
    [23, 77, 1],
    [24, 77, 0.5],
    [24.5, 79, 0.5],
    [25, 81, 1],
    [26, 84, 1],
    [27, 86, 1],
    [28, 86, 1.5],
    [29.5, 84, 0.5],
    [30, 81, 2],
  ];
  pushPhrase(ev, 0, soar, 0.28, 'flute');
  // B section: the wind drops into D minor — vertigo
  const vertigo: Phrase = [
    [0, 72, 1.5],
    [1.5, 74, 0.5],
    [2, 72, 1],
    [3, 69, 1],
    [4, 67, 1],
    [5, 69, 0.5],
    [5.5, 72, 0.5],
    [6, 74, 1.5],
    [7.5, 72, 0.5],
    [8, 69, 1],
    [9, 67, 1],
    [10, 64, 2],
    [12, 66, 1],
    [13, 69, 0.5],
    [13.5, 72, 0.5],
    [14, 74, 1],
    [15, 72, 1],
    [16, 69, 1.5],
    [17.5, 67, 0.5],
    [18, 66, 1],
    [19, 62, 1],
    [20, 64, 3],
  ];
  pushPhrase(ev, 40, vertigo, 0.18, 'oboe');
  // oboe answer an octave below
  pushPhrase(
    ev,
    40,
    vertigo.map(([b, m, d]) => [b, m - 12, d] as Phrase[number]),
    0.1,
    'reed',
  );
  // reprise: flute above, dulcimer doubling near the end
  pushPhrase(ev, 80, soar, 0.26, 'flute');
  pushPhrase(
    ev,
    80,
    soar.map(([b, m, d]) => [b, m + 12, d] as Phrase[number]),
    0.08,
    'tinyBell',
  );

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 108, bars: 20, events: ev };
}

/** The Sowfield: "Boots and Banners". D major, 108 bpm, 16 bars. The Vale Cup
 *  match-day tune (docs/prd/vale-cup.md): a jaunty harvest-festival stomp that
 *  stays kin to Eastbrook's D major so the walk-up crossfade from the vale
 *  never clashes. Oom-pah lute-and-bass under a whistling pipe tune, frame
 *  drum on the boots, wood block and shaker for the clapping stands, and a
 *  dulcimer answer in the back eight where the crowd starts singing along. */
function composeValeCup(): Theme {
  const ev: NoteEvent[] = [];
  // "Champion's Walk". A major, 120 bpm, 16 bars. The Sowfield tournament
  // ground is no longer a D major pipe-and-boots stomp — this is a fast,
  // cinematic A major fanfare for the arriving champion. Brass and strings
  // trade a short heraldic motto over a galloping rhythm: timpani on 1,
  // frame drum on 2 and 4, and a shaker running the gaps. The B section
  // drops into F# minor before the fanfare returns for the final lap.
  const A = { root: 57 },
    D = { root: 62 },
    E = { root: 64 },
    F$m = { root: 54, minor: true };
  const Bm = { root: 59, minor: true },
    C$m = { root: 49, minor: true };
  const chords: ChordDef[] = [A, D, A, E, F$m, D, A, E, F$m, C$m, D, A, A, D, E, A];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 8;
    // galloping bass: root, fifth, root, octave — a horse's canter
    pushNote(ev, b0, c.root - 24, 0.5, 0.42, 'bass');
    pushNote(ev, b0 + 1, c.root - 17, 0.4, 0.28, 'bass');
    pushNote(ev, b0 + 2, c.root - 24, 0.4, 0.34, 'bass');
    pushNote(ev, b0 + 3, c.root - 12, 0.5, 0.22, 'bass');
    // drums: timpani beats, frame drum backbeat
    pushNote(ev, b0, 38, 0.8, 0.38, 'timpani');
    pushDrumHits(ev, b0, [1.5, 3.5], 'frameDrum', 0.16, 45);
    // shaker connecting the beats
    pushDrumHits(ev, b0, [0.5, 1, 2, 2.5, 3], 'shaker', 0.1, 72);
    // brass chord stab on the downbeat of heavy bars
    if (bar % 2 === 0) pushVoicing(ev, b0, [t[0], t[2], t[0] + 12], 0.5, 0.2, 'brassStab');
    // strings sustain over the phrase
    if (bar % 4 === 0) pushPedal(ev, b0, c.root, 'strings', 0.14);
    // second half: cymbal swell on 4
    if (late && bar % 2 === 1) pushNote(ev, b0 + 3, 70, 0.3, 0.1, 'cymSwell');
  });

  // Fanfare (brass): rising triad, the champion's call
  const fanfare: Phrase = [
    [0, 69, 0.25],
    [0.25, 73, 0.25],
    [0.5, 76, 0.5],
    [1, 73, 0.25],
    [1.25, 76, 0.25],
    [1.5, 80, 1],
    [2.5, 78, 0.25],
    [2.75, 76, 0.25],
    [3, 73, 0.5],
    [3.5, 69, 0.5],
    [4, 73, 0.25],
    [4.25, 76, 0.25],
    [4.5, 81, 1],
    [5.5, 80, 0.25],
    [5.75, 78, 0.25],
    [6, 76, 1],
    [7, 73, 0.5],
    [7.5, 76, 0.5],
    [8, 80, 0.25],
    [8.25, 81, 0.25],
    [8.5, 83, 1],
    [9.5, 81, 0.25],
    [9.75, 80, 0.25],
    [10, 78, 1],
    [11, 76, 0.5],
    [11.5, 73, 0.5],
    [12, 73, 0.25],
    [12.25, 76, 0.25],
    [12.5, 80, 1],
    [13.5, 81, 0.5],
    [14, 85, 1.5],
    [15.5, 83, 0.5],
    [16, 81, 1.5],
    [17.5, 80, 0.5],
    [18, 78, 2],
    [20, 76, 0.5],
    [20.5, 78, 0.5],
    [21, 80, 1],
    [22, 78, 1],
    [23, 76, 1],
    [24, 73, 2],
    [26, 76, 1],
    [27, 80, 1],
    [28, 81, 2],
    [30, 85, 2],
    [32, 83, 0.5],
    [32.5, 81, 0.5],
    [33, 80, 0.5],
    [33.5, 78, 0.5],
    [34, 76, 2],
    [36, 73, 1],
    [37, 76, 1],
    [38, 80, 2],
    [40, 81, 2],
    [42, 80, 1],
    [43, 78, 1],
    [44, 76, 3],
  ];
  pushPhrase(ev, 0, fanfare, 0.32, 'horn');
  // strings answer a third below
  pushPhrase(
    ev,
    0,
    fanfare.map(([b, m, d]) => [b, m - 4, d] as Phrase[number]),
    0.16,
    'strings',
  );
  // reprise: the fanfare returns with a tinyBell descant
  pushPhrase(ev, 64, fanfare, 0.3, 'horn');
  pushPhrase(
    ev,
    64,
    fanfare.map(([b, m, d]) => [b, m + 12, d] as Phrase[number]),
    0.08,
    'tinyBell',
  );

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 120, bars: 16, events: ev };
}

/** Hollow Crypt: "Sleep, Neighbors". D minor over a phrygian creep, 100 bpm.
 *  A violated village graveyard: a funeral bell tolls over an unmoving D
 *  pedal, the chapel hymn starts and breaks off, bones skitter in the wood
 *  blocks, and in the second half a piano lament grieves for the neighbors
 *  raised out of their own graves. Intimate dread, not yet apocalypse. */
function composeDungeonHollowCrypt(): Theme {
  const ev: NoteEvent[] = [];
  // "Barrow of the Forgotten". G# minor, 94 bpm, 16 bars. The violated
  // graveyard is no longer a D phrygian funeral crawl — this is G# minor,
  // a key that feels wrong under the fingers. Low oboe and reed trade a
  // narrow, rocking two-note lament (G#-F#) over a static pedal. No bell,
  // no hymn, no piano grief. Instead: a subterranean pad, a single war drum
  // that doesn't keep time (irregular hits on 1 and then 2.75), and dulcimer
  // glints that sound like disturbed bone catching torchlight. The B section
  // tries to lift to C# minor but is pulled back down.
  const G$m = { root: 56, minor: true },
    C$m = { root: 49, minor: true },
    E = { root: 52 };
  const F$ = { root: 54 },
    B = { root: 59 };
  const chords: ChordDef[] = [G$m, G$m, C$m, G$m, E, F$, G$m, G$m, C$m, G$m, F$, E, G$m, C$m, F$, G$m];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 8;
    // the pedal never moves: G# beneath everything
    pushPedal(ev, b0, 56, 'strings', 0.1);
    // bass slow and heavy
    pushNote(ev, b0, c.root - 24, 3.5, 0.3, 'bass');
    // the shudder: a minor-second bowing on the strings
    if (c.minor) pushVoicing(ev, b0, [c.root + 12, c.root + 13], 4.05, 0.06, 'strings');
    // irregular war drum: not a steady pulse
    pushNote(ev, b0, 38, 0.8, late ? 0.28 : 0.16, 'warDrum');
    if (bar % 3 === 0) pushNote(ev, b0 + 2.75, 38, 0.6, 0.12, 'warDrum');
    // bone glint: dulcimer pick at the very edge of hearing
    if (bar % 2 === 1) pushNote(ev, b0 + 3.25, t[2] + 24, 0.4, 0.05, 'dulcimer');
    // oboe shadow: a single held tone, winding up or down
    if (late) pushNote(ev, b0 + 1, t[1] + 12, 2.5, 0.09, 'oboe');
  });

  // Lament (oboe): the narrow two-note rock G#-F#, expanding as it loops
  const lament: Phrase = [
    [0, 68, 1],
    [1, 66, 1.5],
    [2.5, 64, 0.5],
    [3, 66, 1],
    [4, 66, 1],
    [5, 64, 1],
    [6, 68, 2],
    [8, 66, 1],
    [9, 64, 1.5],
    [10.5, 63, 0.5],
    [11, 64, 1],
    [12, 63, 1],
    [13, 61, 0.5],
    [13.5, 59, 0.5],
    [14, 68, 2.5],
    [16.5, 66, 0.5],
    [17, 68, 1],
    [18, 66, 0.5],
    [18.5, 64, 0.5],
    [19, 63, 1],
    [20, 64, 2],
    [22, 66, 1],
    [23, 68, 1],
    [24, 66, 1.5],
    [25.5, 64, 0.5],
    [26, 63, 2],
    [28, 61, 3.5],
  ];
  pushPhrase(ev, 4, lament, 0.22, 'oboe');
  // reed answers an octave below in the second half
  pushPhrase(
    ev,
    36,
    lament.map(([b, m, d]) => [b, m - 12, d] as Phrase[number]),
    0.12,
    'reed',
  );
  // reprise: oboe alone
  pushPhrase(ev, 68, lament, 0.2, 'oboe');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 94, bars: 16, events: ev };
}

/** Sunken Bastion: "The Drowning Dark". E minor passacaglia, 116 bpm.
 *  The keep drowned with its honor intact: a lament ground bass (E, D, C, B)
 *  repeats while water textures pile on in four-bar tides: harp sixteenths,
 *  the mistcaller's dirge, the drowned choir with drums, then rising staccato
 *  runs, and the loop empties back to the still surface. Knight-Commander
 *  Olen's fanfare surfaces twice, rusted but noble. */
function composeDungeonSunkenBastion(): Theme {
  const ev: NoteEvent[] = [];
  // "The Sunken Bell". F# minor, 104 bpm, 16 bars. The drowned keep is no
  // longer an E minor passacaglia with a ground bass — this is a
  // slow-rise two-chord cycle (F#m - C#m) that breathes like water moving
  // through a flooded hall. A single deep bell tolls at the start of each
  // 4-bar group. Harp arpeggios rise and fall like stirring currents. The
  // oboe carries a lonely, arching melody. No choir, no drums, no fanfare.
  // The floor dropped out; only the quiet remains.
  const F$m = { root: 54, minor: true },
    C$m = { root: 49, minor: true };
  const D = { root: 50 },
    E = { root: 52 },
    A = { root: 57 };
  const chords: ChordDef[] = [F$m, C$m, F$m, C$m, D, A, F$m, C$m, F$m, C$m, D, E, F$m, C$m, F$m, F$m];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const phrase = bar % 4;
    // deep bell: tolls once per phrase
    if (phrase === 0) pushNote(ev, b0, t[0] - 24, 4.5, 0.18, 'bell');
    // bass: a slow half-note exchange
    pushNote(ev, b0, c.root - 24, 2.5, 0.32, 'bass');
    pushNote(ev, b0 + 2, c.root - 17, 2.0, 0.2, 'bass');
    // harp: arpeggio flowing upward from the bass root
    const water = [c.root - 12, t[0], t[1], t[2], t[0] + 12, t[1] + 12, t[2] + 12, t[0] + 24];
    for (const [i, n] of water.entries()) {
      pushNote(ev, b0 + i * 0.5, n, 0.6, 0.14, 'harp');
    }
    // pad: strings holding the chord's heart
    if (phrase % 2 === 0) pushPedal(ev, b0, c.root, 'strings', 0.1);
    // tiny bell: a submerged chime at the end of each phrase
    if (phrase === 3) pushNote(ev, b0 + 3.5, t[2] + 24, 0.8, 0.04, 'tinyBell');
  });

  // The melody (oboe): a lonely arch over the two-chord tide
  const arch: Phrase = [
    [0, 73, 1],
    [1, 71, 1],
    [2, 69, 1.5],
    [3.5, 71, 0.5],
    [4, 73, 1],
    [5, 76, 0.5],
    [5.5, 78, 0.5],
    [6, 76, 1.5],
    [7.5, 73, 0.5],
    [8, 71, 1.5],
    [9.5, 69, 0.5],
    [10, 66, 2],
    [12, 68, 1],
    [13, 71, 1],
    [14, 73, 2.5],
    [16.5, 71, 1.5],
    [18, 69, 1],
    [19, 66, 1],
    [20, 64, 2],
    [22, 66, 1],
    [23, 68, 1],
    [24, 69, 1],
    [25, 73, 1],
    [26, 71, 2],
    [28, 69, 1.5],
    [29.5, 68, 0.5],
    [30, 66, 2.5],
    [32.5, 64, 0.5],
    [33, 66, 1],
    [34, 69, 1.5],
    [35.5, 71, 0.5],
    [36, 73, 1.5],
    [37.5, 76, 0.5],
    [38, 73, 2.5],
    [40.5, 71, 1.5],
    [42, 69, 1],
    [43, 66, 1],
    [44, 64, 3],
  ];
  pushPhrase(ev, 4, arch, 0.24, 'oboe');
  // strings answer at half volume an octave down
  pushPhrase(
    ev,
    4,
    arch.map(([b, m, d]) => [b, m - 12, d] as Phrase[number]),
    0.1,
    'strings',
  );
  // reprise: oboe alone, one last bell toll
  pushPhrase(ev, 68, arch, 0.22, 'oboe');
  pushNote(ev, 64, 30, 4.5, 0.14, 'bell');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 104, bars: 16, events: ev };
}

/** Gravewyrm Sanctum: "It Breathes Below". B phrygian, 126 bpm. The final
 *  crawl is a ritual procession over a heartbeat: paired war-drum thumps,
 *  a cult chant that a lower choir answers back, phrygian staccato risers,
 *  brass on the chamber thresholds, and a serpent figure slithering in the
 *  low square lead as the party nears the dais. */
function composeDungeonGravewyrmSanctum(): Theme {
  const ev: NoteEvent[] = [];
  // "Serpent Coils". F lydian augmented, 88 bpm, 16 bars. The wyrm's
  // chamber is no longer a B phrygian ritual heartbeat — this is a
  // slithering, whole-tone-inflected crawl in F with a raised fourth (B)
  // and a raised fifth (C#) that never quite resolves. The rhythm is
  // irregular: low strings slither in staggered entries, wood blocks
  // click like chitin, and a serpentine line on the square lead winds
  // through the texture. No war drum heartbeat, no chant, no choir.
  // The ground is never steady under your feet.
  const F = { root: 53 },
    Dm = { root: 50, minor: true },
    Gm = { root: 55, minor: true };
  const Bb = { root: 58 },
    C = { root: 60 },
    Eb = { root: 51 };
  const chords: ChordDef[] = [F, Dm, Bb, C, F, Dm, Gm, C, F, Bb, Eb, C, Dm, Gm, C, F];

  chords.forEach((c, bar) => {
    const b0 = bar * 4;
    const t = triad(c);
    const late = bar >= 8;
    // slithering bass: root then a staggered chromatic approach
    pushNote(ev, b0, c.root - 24, 1.5, 0.28, 'bass');
    pushNote(ev, b0 + 1.5, c.root - 19, 0.6, 0.16, 'bass');
    pushNote(ev, b0 + 2.75, c.root - 18, 0.6, 0.14, 'bass');
    // wood blocks: irregular clicks like mandibles
    pushDrumHits(ev, b0, [0.75, 2.25], 'woodBlock', 0.08, 68);
    if (bar % 3 === 0) pushDrumHits(ev, b0, [3.25, 3.5], 'woodBlock', 0.06, 70);
    // low pad: an uneasy drone with the raised fifth
    if (bar % 2 === 0) pushNote(ev, b0, c.root + 10, 4.05, 0.07, 'pad');
    // frame drum: one hit per bar, never on the same beat
    const drumBeat = [0.5, 1.5, 2, 3.5][bar % 4];
    pushNote(ev, b0 + drumBeat, 44, 0.4, late ? 0.12 : 0.08, 'frameDrum');
    // reed: a sustained note that bends at the end of each 2-bar group
    if (bar % 2 === 0) pushNote(ev, b0 + 2, t[1] + 12, 2.0, 0.07, 'reed');
  });

  // The serpent line (squareLead): winding chromatic motion
  const serpent: Phrase = [
    [0, 73, 1],
    [1, 72, 0.5],
    [1.5, 74, 0.5],
    [2, 76, 1.5],
    [3.5, 75, 0.5],
    [4, 74, 1],
    [5, 72, 0.5],
    [5.5, 71, 0.5],
    [6, 73, 1.5],
    [7.5, 71, 0.5],
    [8, 69, 1.5],
    [9.5, 71, 0.5],
    [10, 72, 1],
    [11, 74, 1],
    [12, 76, 1],
    [13, 74, 0.5],
    [13.5, 72, 0.5],
    [14, 71, 2],
    [16, 69, 1],
    [17, 71, 1],
    [18, 72, 1.5],
    [19.5, 74, 0.5],
    [20, 76, 1],
    [21, 77, 0.5],
    [21.5, 76, 0.5],
    [22, 74, 1.5],
    [23.5, 72, 0.5],
    [24, 71, 1],
    [25, 69, 1],
    [26, 67, 2],
    [28, 64, 2.5],
    [30.5, 66, 0.5],
    [31, 67, 1],
    [32, 69, 1.5],
    [33.5, 71, 0.5],
    [34, 72, 1],
    [35, 74, 0.5],
    [35.5, 76, 0.5],
    [36, 78, 1.5],
    [37.5, 76, 0.5],
    [38, 74, 2],
    [40, 72, 1],
    [41, 71, 1],
    [42, 69, 2],
    [44, 67, 3.5],
  ];
  pushPhrase(ev, 4, serpent, 0.18, 'squareLead');
  // oboe echo in the second half
  pushPhrase(ev, 36, serpent, 0.12, 'oboe');
  // half-time strings: a shimmer behind the serpent
  pushPhrase(
    ev,
    4,
    serpent.map(([b, m, d]) => [b, m + 12, d] as Phrase[number]),
    0.06,
    'strings',
  );
  // reprise: the serpent returns alone
  pushPhrase(ev, 68, serpent, 0.16, 'squareLead');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 88, bars: 16, events: ev };
}

// ---------------------------------------------------------------------------
// Battle music. Every variant grows from the original combat cue's DNA: the
// pounding staccato eighth cell from D3 (root, root, flat three, root, five,
// root, flat three, four), timpani on one, three, and the and-of-four pickup,
// and bare horn fifths. Orchestral tension in the classic MMO mold: no drum
// kit backbeat, no song melody; percussion, brass gestures, and string
// agitato that sit under gameplay. All written from D so COMBAT_TRANSPOSE can
// move the active cue onto each zone's tonal center. The alternates are
// registered as extra themes purely so the render tool can audition them;
// only the layer named 'combat' ever plays in game.
// ---------------------------------------------------------------------------

const COMBAT_CELL = [0, 0, 3, 0, 7, 0, 3, 5];

function pushCombatCell(out: NoteEvent[], b0: number, base: number, vel: number): void {
  for (const [i, s] of COMBAT_CELL.entries()) {
    pushNote(out, b0 + i * 0.5, base + s, 0.4, vel, 'stacc');
  }
}

function pushCombatTimpani(out: NoteEvent[], b0: number, scale = 1): void {
  pushNote(out, b0, 38, 1, 0.55 * scale, 'timpani');
  pushNote(out, b0 + 2, 38, 1, 0.4 * scale, 'timpani');
  pushNote(out, b0 + 3.5, 38, 0.5, 0.3 * scale, 'timpani');
}

/** "Vanguard" (the default): the original cue grown into sixteen bars. The
 *  first four bars ARE the original texture over a new bass shadow; four-bar
 *  terraces then add the octave agitato, war drums, and a rising-fourth war
 *  call; the music shifts up a half step for a two-bar shock answered by low
 *  brass, returns home, marches bVI to bVII back up, hits a three-bar tutti,
 *  and the last bar strikes once, breathes for two beats, and drops straight
 *  back into the pounding cell so chain pulls never hear a dead seam. */
function composeCombat(): Theme {
  const ev: NoteEvent[] = [];
  // "Iron Tide". C phrygian, 138 bpm, 16 bars. No longer a D-based orchestral
  // cell pattern — this is a percussive, metal-adjacent combat theme in
  // C phrygian (the flat second (Db) gives every phrase a savage edge).
  // The engine is a constant sixteenth-note staccato string ride on the
  // root-fifth-octave skeleton, timpani hitting every downbeat, and brass
  // stabs that cut across the grid. No horn melody, no war drum heartbeat,
  // no cymbal swells. The B section drops into the flat VI (Ab major) before
  // the assault re-engages.
  const bassAt = (b0: number, root: number): void => {
    pushNote(ev, b0, root, 0.25, 0.5, 'bass');
    pushNote(ev, b0 + 0.5, root, 0.25, 0.36, 'bass');
    pushNote(ev, b0 + 1, root + 7, 0.25, 0.3, 'bass');
    pushNote(ev, b0 + 1.5, root - 5, 0.25, 0.26, 'bass');
    pushNote(ev, b0 + 2, root, 0.25, 0.36, 'bass');
    pushNote(ev, b0 + 2.5, root, 0.25, 0.28, 'bass');
    pushNote(ev, b0 + 3, root + 7, 0.25, 0.22, 'bass');
    pushNote(ev, b0 + 3.5, root - 5, 0.25, 0.2, 'bass');
  };
  // staccato eighth-note ride: root, flat-two, root, five, root, flat-two, root, flat-seven
  const RIDE = [0, 1, 0, 7, 0, 1, 0, 10];
  const rideAt = (b0: number, base: number, vel: number): void => {
    for (const [i, s] of RIDE.entries()) {
      pushNote(ev, b0 + i * 0.5, base + s, 0.35, vel, 'stacc');
    }
  };

  // bars 1-4: establish the ride, timpani on every beat
  for (let bar = 0; bar < 4; bar++) {
    const b0 = bar * 4;
    rideAt(b0, 60, 0.24);
    bassAt(b0, 36);
    pushNote(ev, b0, 38, 1, 0.5, 'timpani');
    pushNote(ev, b0 + 1, 38, 0.6, 0.32, 'timpani');
    pushNote(ev, b0 + 2, 38, 0.6, 0.36, 'timpani');
    pushNote(ev, b0 + 3, 38, 0.6, 0.28, 'timpani');
    // brass stab on bar 2 and 4
    if (bar % 2 === 1) pushVoicing(ev, b0, [36, 43], 0.5, 0.24, 'brassStab');
    // frame drum on offbeats
    pushDrumHits(ev, b0, [0.5, 1.5, 2.5, 3.5], 'frameDrum', 0.14, 45);
  }

  // bars 5-8: double the ride, add octave staccato above, war drum joins
  for (let bar = 4; bar < 8; bar++) {
    const b0 = bar * 4;
    rideAt(b0, 60, 0.26);
    rideAt(b0, 72, 0.14);
    bassAt(b0, 36);
    pushNote(ev, b0, 38, 1, 0.55, 'timpani');
    pushNote(ev, b0 + 1, 38, 0.6, 0.36, 'timpani');
    pushNote(ev, b0 + 2, 38, 0.6, 0.4, 'timpani');
    pushNote(ev, b0 + 3, 38, 0.6, 0.32, 'timpani');
    pushVoicing(ev, b0, [36, 43], 0.5, 0.28, 'brassStab');
    pushNote(ev, b0 + 2, 38, 0.8, 0.22, 'warDrum');
    pushNote(ev, b0 + 3.5, 38, 0.6, 0.18, 'warDrum');
    pushDrumHits(ev, b0, [0.5, 1.5, 2.5, 3.5], 'frameDrum', 0.16, 45);
    if (bar === 7) pushNote(ev, b0 + 3.75, 70, 0.3, 0.14, 'cymSwell');
  }

  // bars 9-12: modulate to the flat VI (Ab) — the dark respite
  const bassAb = (b0: number): void => {
    pushNote(ev, b0, 44, 0.25, 0.5, 'bass');
    pushNote(ev, b0 + 0.5, 44, 0.25, 0.36, 'bass');
    pushNote(ev, b0 + 1, 51, 0.25, 0.3, 'bass');
    pushNote(ev, b0 + 1.5, 39, 0.25, 0.26, 'bass');
    pushNote(ev, b0 + 2, 44, 0.25, 0.36, 'bass');
    pushNote(ev, b0 + 2.5, 44, 0.25, 0.28, 'bass');
    pushNote(ev, b0 + 3, 51, 0.25, 0.22, 'bass');
    pushNote(ev, b0 + 3.5, 39, 0.25, 0.2, 'bass');
  };
  const RIDE_Ab = [0, 3, 0, 7, 0, 3, 0, 10];
  const rideAbAt = (b0: number, base: number, vel: number): void => {
    for (const [i, s] of RIDE_Ab.entries()) {
      pushNote(ev, b0 + i * 0.5, base + s, 0.35, vel, 'stacc');
    }
  };
  for (let bar = 8; bar < 12; bar++) {
    const b0 = bar * 4;
    rideAbAt(b0, 56, 0.22);
    rideAbAt(b0, 68, 0.12);
    bassAb(b0);
    pushNote(ev, b0, 38, 1, 0.48, 'timpani');
    pushNote(ev, b0 + 2, 38, 0.6, 0.36, 'timpani');
    pushNote(ev, b0 + 3, 38, 0.6, 0.28, 'timpani');
    if (bar % 2 === 0) pushVoicing(ev, b0, [44, 51], 0.5, 0.22, 'brassStab');
    pushDrumHits(ev, b0, [0.5, 1.5, 2.5, 3.5], 'frameDrum', 0.12, 45);
  }

  // bars 13-16: return to C phrygian, full force
  for (let bar = 12; bar < 16; bar++) {
    const b0 = bar * 4;
    rideAt(b0, 60, 0.28);
    rideAt(b0, 72, 0.16);
    rideAt(b0, 84, 0.08);
    bassAt(b0, 36);
    pushNote(ev, b0, 38, 1, 0.6, 'timpani');
    pushNote(ev, b0 + 1, 38, 0.6, 0.4, 'timpani');
    pushNote(ev, b0 + 2, 38, 0.6, 0.44, 'timpani');
    pushNote(ev, b0 + 3, 38, 0.6, 0.36, 'timpani');
    pushVoicing(ev, b0, [36, 43], 0.5, 0.32, 'brassStab');
    pushVoicing(ev, b0 + 1.5, [36, 43], 0.5, 0.24, 'brassStab');
    pushVoicing(ev, b0 + 3, [36, 43], 0.5, 0.2, 'brassStab');
    pushNote(ev, b0, 38, 0.8, 0.26, 'warDrum');
    pushNote(ev, b0 + 2.75, 38, 0.7, 0.2, 'warDrum');
    pushDrumHits(ev, b0, [0.5, 1.5, 2.5, 3.5], 'frameDrum', 0.18, 45);
    if (bar === 15) pushNote(ev, b0 + 3, 70, 0.5, 0.2, 'cymSwell');
  }

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 138, bars: 16, events: ev };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------------

const FADE_SECONDS = 2.2;
const LOOKAHEAD = 0.6;
const STORAGE_KEY = 'ev_music_on';

// The combat cue is written from C phrygian (MIDI 60 = C). The COMBAT_TRANSPOSE
// table shifts it onto each zone's tonal center so the crossfade never fights
// the theme underneath (all shifts upward):
//   town_eastbrook  0 -> D (Eastbrook is D major)
//   town_fenbridge  5 -> G (Fenbridge is G major)
//   town_highwatch  9 -> B (Highwatch is B minor)
//   vale  7 -> A (vale is A dorian)
//   vale_legacy  7 -> A (original vale is A dorian)
//   marsh  2 -> E (marsh is E aeolian)
//   peaks  0 -> D (peaks anthem is D major)
//   vale_cup  0 -> D (the Sowfield match tune is D major)
//   dungeon_hollow_crypt      0 -> D
//   dungeon_sunken_bastion    2 -> E
//   dungeon_gravewyrm_sanctum 9 -> B
const COMBAT_TRANSPOSE: Record<MusicZone, number> = {
  town_eastbrook: 0,
  town_fenbridge: 5,
  town_highwatch: 9,
  vale: 7,
  vale_legacy: 7,
  marsh: 2,
  peaks: 0,
  vale_cup: 0,
  dungeon_hollow_crypt: 0,
  dungeon_sunken_bastion: 2,
  dungeon_gravewyrm_sanctum: 9,
};

export function buildMusicThemes(withOverrides = true): Record<string, Theme> {
  const composed: Record<string, Theme> = {
    town_eastbrook: composeTownEastbrook(),
    town_fenbridge: composeTownFenbridge(),
    town_highwatch: composeTownHighwatch(),
    vale: composeVale(),
    vale_legacy: composeLegacyVale(),
    marsh: composeMarsh(),
    peaks: composePeaks(),
    vale_cup: composeValeCup(),
    dungeon_hollow_crypt: composeDungeonHollowCrypt(),
    dungeon_sunken_bastion: composeDungeonSunkenBastion(),
    dungeon_gravewyrm_sanctum: composeDungeonGravewyrmSanctum(),
    combat: composeCombat(),
  };
  if (!withOverrides) return composed;
  // themes edited and saved from the music editor take precedence
  return { ...composed, ...MUSIC_OVERRIDES };
}

// Per-theme loudness trims, applied to each layer's gain so every cue plays
// at the same perceived level. Values are MEASURED, not guessed: each theme
// was rendered offline through the exact in-game chain, its gated windowed
// RMS computed (400ms windows, windows more than 15 dB under the loudest
// gated out so drop bars and quiet middles do not skew the level), and the
// trim set to match the Eastbrook town theme, the loudest cue and the game's
// reference. Recompute with scripts/render_music.mjs plus a gated-RMS pass
// whenever a composition changes materially.
export const THEME_TRIM: Record<string, number> = {
  town_eastbrook: 1.0,
  town_fenbridge: 1.65,
  town_highwatch: 2.15,
  vale: 3.3,
  vale_legacy: 1.35,
  marsh: 1.85,
  peaks: 2.05,
  // ESTIMATED (not yet measured): the Sowfield tune is voiced close to the
  // Eastbrook town density (lute strum + oom-pah bass + drums + pipe lead), so
  // it starts near the town reference. Recompute with scripts/render_music.mjs
  // + the gated-RMS pass alongside the next soundtrack measurement batch.
  vale_cup: 1.4,
  dungeon_hollow_crypt: 2.95,
  dungeon_sunken_bastion: 2.95,
  dungeon_gravewyrm_sanctum: 1.8,
  combat: 1.35,
};

export class MusicSynth {
  constructor(private ctx: BaseAudioContext) {}

  playNote(
    evt: NoteEvent,
    when: number,
    spb: number,
    layer: Pick<Layer, 'gain' | 'transpose'>,
  ): void {
    const freq = mtof(evt.midi + layer.transpose);
    const dur = Math.max(0.1, evt.dur * spb);
    const out = layer.gain;
    switch (evt.inst) {
      case 'strings':
        this.strings(when, freq, dur, evt.vel, out);
        break;
      case 'flute':
        this.flute(when, freq, dur, evt.vel, out);
        break;
      case 'harp':
        this.pluck(when, freq, evt.vel, out, 1.4);
        break;
      case 'bass':
        this.pluck(when, freq, evt.vel, out, 0.9, true);
        break;
      case 'horn':
        this.horn(when, freq, dur, evt.vel, out);
        break;
      case 'choir':
        this.choir(when, freq, dur, evt.vel, out);
        break;
      case 'bell':
        this.bell(when, freq, evt.vel, out);
        break;
      case 'timpani':
        this.timpani(when, freq, evt.vel, out);
        break;
      case 'stacc':
        this.strings(when, freq, Math.min(dur, 0.22), evt.vel, out, 0.02);
        break;
      case 'pad':
        this.pad(when, freq, dur, evt.vel, out);
        break;
      case 'lute':
        this.lute(when, freq, evt.vel, out);
        break;
      case 'dulcimer':
        this.dulcimer(when, freq, evt.vel, out);
        break;
      case 'frameDrum':
        this.frameDrum(when, evt.vel, out);
        break;
      case 'warDrum':
        this.warDrum(when, evt.vel, out);
        break;
      case 'reed':
        this.reed(when, freq, dur, evt.vel, out);
        break;
      case 'pipe':
        this.pipe(when, freq, dur, evt.vel, out);
        break;
      case 'squareLead':
        this.squareLead(when, freq, dur, evt.vel, out);
        break;
      case 'woodBlock':
        this.woodBlock(when, evt.vel, out);
        break;
      case 'tinyBell':
        this.tinyBell(when, freq, evt.vel, out);
        break;
      case 'piano':
        this.piano(when, freq, dur, evt.vel, out);
        break;
      case 'shaker':
        this.shaker(when, evt.vel, out);
        break;
      case 'brassStab':
        this.brassStab(when, freq, dur, evt.vel, out);
        break;
      case 'cymSwell':
        this.cymSwell(when, dur, evt.vel, out);
        break;
      case 'oboe':
        this.oboe(when, freq, dur, evt.vel, out);
        break;
    }
  }

  // Folk oboe: a detuned sawtooth pair through a reedy formant with delayed
  // vibrato, plus a triangle carrying the fundamental. The same chorused-saw
  // richness as the strings voice, shaped into a warm double-reed lead.
  private oboe(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.17, 0.055, 0.22);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = Math.min(2400, 600 + freq * 2.2);
    formant.Q.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    formant.connect(lp).connect(g).connect(out);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibGain = ctx.createGain();
    vibGain.gain.setValueAtTime(0, when);
    vibGain.gain.linearRampToValueAtTime(freq * 0.004, when + 0.3);
    vib.connect(vibGain);
    for (const det of [-5, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      vibGain.connect(o.frequency);
      o.connect(formant);
      o.start(when);
      o.stop(when + dur + 0.4);
    }
    // the fundamental body the narrow formant would otherwise thin out
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = freq;
    vibGain.connect(sub.frequency);
    sub.connect(subGain).connect(lp);
    sub.start(when);
    sub.stop(when + dur + 0.4);
    vib.start(when);
    vib.stop(when + dur + 0.4);
  }

  // Suspended-cymbal swell: highpassed noise rising over the note's duration
  // and ringing out past it. A short duration reads as a crash.
  private cymSwell(when: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const ring = 1.4;
    const len = Math.floor(ctx.sampleRate * (dur + ring));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.001, vel * 0.26),
      when + Math.max(0.03, dur * 0.8),
    );
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + ring);
    src.connect(hp).connect(g).connect(out);
    src.start(when);
  }

  // Felt piano: a few detuned partials with register-scaled decay plus a soft
  // hammer-noise transient; the damper lifts at note end like a real pedal.
  private piano(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const naturalDecay = Math.min(5.2, Math.max(1.2, 380 / freq));
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = Math.min(5600, 1400 + freq * 4);
    body.Q.value = 0.35;
    body.connect(out);
    // stretched, inharmonic partial stack; the fundamental is a detuned
    // unison pair so exposed notes shimmer instead of reading as a bare sine
    const partials: ReadonlyArray<readonly [number, number, number, number]> = [
      [1, 0.62, 1, -3],
      [1.0005, 0.62, 1, 3],
      [2.003, 0.5, 0.58, 2],
      [3.006, 0.2, 0.36, -4],
      [4.012, 0.09, 0.24, 5],
      [5.02, 0.05, 0.17, -6],
      [7.03, 0.025, 0.12, 4],
    ];
    for (const [ratio, amp, decayMul, cents] of partials) {
      const decay = Math.min(naturalDecay * decayMul, dur + 0.35);
      const g = ctx.createGain();
      const peak = vel * 0.24 * amp;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.14, decay));
      const o = ctx.createOscillator();
      o.type = ratio < 1.01 ? 'triangle' : 'sine';
      o.frequency.value = freq * ratio;
      o.detune.value = cents;
      o.connect(g).connect(body);
      o.start(when);
      o.stop(when + Math.max(0.14, decay) + 0.1);
    }
    // two-part hammer: a low felt thump and a soft brightness transient
    const hammerLen = Math.floor(ctx.sampleRate * 0.016);
    const buf = ctx.createBuffer(1, hammerLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < hammerLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / hammerLen);
    const hammer = ctx.createBufferSource();
    hammer.buffer = buf;
    const bright = ctx.createBiquadFilter();
    bright.type = 'bandpass';
    bright.frequency.value = Math.min(3200, freq * 4);
    bright.Q.value = 0.9;
    const bg = ctx.createGain();
    bg.gain.value = vel * 0.035;
    hammer.connect(bright).connect(bg).connect(out);
    const thump = ctx.createBufferSource();
    thump.buffer = buf;
    const tlp = ctx.createBiquadFilter();
    tlp.type = 'lowpass';
    tlp.frequency.value = 260;
    const tg = ctx.createGain();
    tg.gain.value = vel * 0.05;
    thump.connect(tlp).connect(tg).connect(out);
    hammer.start(when);
    thump.start(when);
  }

  // Shaker/hat: a short burst of highpassed noise for light rhythmic drive.
  private shaker(when: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.055);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.8;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.22, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    src.connect(hp).connect(g).connect(out);
    src.start(when);
  }

  // Brass stab: detuned saw section with a fast bite, brighter and punchier
  // than the soft legato horn; for accents and battle hits.
  private brassStab(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, Math.min(dur, 0.8), vel * 0.16, 0.02, 0.14);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(3400, 700 + freq * 3), when);
    lp.frequency.exponentialRampToValueAtTime(Math.min(1900, 500 + freq * 2), when + 0.28);
    lp.Q.value = 0.7;
    lp.connect(g).connect(out);
    for (const det of [-8, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(when);
      o.stop(when + Math.min(dur, 0.8) + 0.3);
    }
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = freq * 0.5;
    const sg = ctx.createGain();
    sg.gain.value = 0.3;
    sub.connect(sg).connect(lp);
    sub.start(when);
    sub.stop(when + Math.min(dur, 0.8) + 0.3);
  }

  private adsr(when: number, dur: number, peak: number, attack: number, release: number): GainNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, Math.max(when + attack, when + dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur + release);
    return g;
  }

  private strings(
    when: number,
    freq: number,
    dur: number,
    vel: number,
    out: GainNode,
    attack = 0.3,
  ): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.16, attack, 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 750 + freq * 2;
    lp.connect(g).connect(out);
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(when);
      o.stop(when + dur + 0.9);
    }
  }

  private flute(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.3, 0.07, 0.22);
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, when);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.006, when + 0.35);
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    lfoGain.connect(o2.frequency);
    o.connect(g);
    o2.connect(g2).connect(g);
    for (const osc of [o, o2, lfo]) {
      osc.start(when);
      osc.stop(when + dur + 0.4);
    }
  }

  private pluck(
    when: number,
    freq: number,
    vel: number,
    out: GainNode,
    decay: number,
    dark = false,
  ): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * (dark ? 0.3 : 0.22), when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = dark ? 600 : 2600;
    lp.connect(g).connect(out);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(lp);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vel * 0.05, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + decay * 0.5);
    o2.connect(g2).connect(out);
    o.start(when);
    o.stop(when + decay + 0.1);
    o2.start(when);
    o2.stop(when + decay + 0.1);
  }

  private horn(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.2, 0.09, 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 640;
    lp.connect(g).connect(out);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq;
    o.connect(lp);
    o2.connect(lp);
    o.start(when);
    o.stop(when + dur + 0.5);
    o2.start(when);
    o2.stop(when + dur + 0.5);
  }

  private choir(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.13, 0.7, 1.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 580;
    bp.Q.value = 0.6;
    bp.connect(g).connect(out);
    for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(bp);
      o.start(when);
      o.stop(when + dur + 1.3);
    }
  }

  private pad(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.24, 0.75, 1.15);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(1400, 380 + freq * 1.1);
    lp.Q.value = 0.35;
    lp.connect(g).connect(out);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq;
    const g2 = ctx.createGain();
    g2.gain.value = 0.28;
    o.connect(lp);
    o2.connect(g2).connect(lp);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = freq * 0.0025;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    lfoGain.connect(o2.frequency);
    for (const osc of [o, o2, lfo]) {
      osc.start(when);
      osc.stop(when + dur + 1.3);
    }
  }

  private lute(when: number, freq: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.2, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2100;
    hp.connect(lp).connect(g).connect(out);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;
    o.connect(hp);
    o2.connect(g2).connect(hp);

    // tiny pitch bend gives plucked-string life without needing samples.
    o.frequency.setValueAtTime(freq * 1.01, when);
    o.frequency.exponentialRampToValueAtTime(freq, when + 0.08);
    o.start(when);
    o.stop(when + 1.15);
    o2.start(when);
    o2.stop(when + 0.8);
  }

  private dulcimer(when: number, freq: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const body = ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = Math.min(4200, freq * 3.2);
    body.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.18, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.8);
    body.connect(g).connect(out);

    for (const [ratio, amp, decay] of [
      [1, 1, 1.8],
      [2.01, 0.35, 1.1],
      [3.02, 0.12, 0.7],
    ] as const) {
      const og = ctx.createGain();
      og.gain.setValueAtTime(amp, when);
      og.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      const o = ctx.createOscillator();
      o.type = ratio === 1 ? 'triangle' : 'sine';
      o.frequency.value = freq * ratio;
      o.connect(og).connect(body);
      o.start(when);
      o.stop(when + decay + 0.1);
    }
  }

  private reed(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.16, 0.04, 0.18);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(1800, 420 + freq * 1.8);
    bp.Q.value = 1.1;
    bp.connect(g).connect(out);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 0.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.2;
    o.connect(bp);
    o2.connect(g2).connect(bp);
    o.start(when);
    o.stop(when + dur + 0.25);
    o2.start(when);
    o2.stop(when + dur + 0.25);
  }

  private pipe(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, dur, vel * 0.22, 0.035, 0.28);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(g).connect(out);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const airy = ctx.createOscillator();
    airy.type = 'triangle';
    airy.frequency.value = freq * 2;
    const airyGain = ctx.createGain();
    airyGain.gain.value = 0.08;
    o.connect(lp);
    airy.connect(airyGain).connect(lp);
    o.start(when);
    o.stop(when + dur + 0.35);
    airy.start(when);
    airy.stop(when + dur + 0.35);
  }

  private squareLead(when: number, freq: number, dur: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = this.adsr(when, Math.min(dur, 0.7), vel * 0.14, 0.012, 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(3600, 900 + freq * 2.4);
    lp.Q.value = 0.45;
    lp.connect(g).connect(out);

    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 0.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, when);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.0035, when + 0.05);
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    o.connect(lp);
    o2.connect(g2).connect(lp);
    for (const osc of [o, o2, lfo]) {
      osc.start(when);
      osc.stop(when + dur + 0.12);
    }
  }

  private tinyBell(when: number, freq: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    for (const [ratio, amp, dec] of [
      [1, 0.16, 1.1],
      [2.01, 0.06, 0.7],
      [3.01, 0.025, 0.42],
    ] as const) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * amp, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dec);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      o.connect(g).connect(out);
      o.start(when);
      o.stop(when + dec + 0.1);
    }
  }

  private woodBlock(when: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const body = ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 960;
    body.Q.value = 5.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.35, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    body.connect(g).connect(out);

    const noiseLen = Math.floor(ctx.sampleRate * 0.035);
    const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen) ** 2.2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(body);
    src.start(when);

    const tick = ctx.createOscillator();
    tick.type = 'triangle';
    tick.frequency.value = 1180;
    tick.connect(body);
    tick.start(when);
    tick.stop(when + 0.06);
  }

  private frameDrum(when: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.45, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    bp.connect(g).connect(out);

    const noiseLen = Math.floor(ctx.sampleRate * 0.09);
    const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen) ** 1.6;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(bp);
    src.start(when);

    const tone = ctx.createOscillator();
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(vel * 0.08, when);
    tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    tone.type = 'sine';
    tone.frequency.value = 140;
    tone.connect(tg).connect(out);
    tone.start(when);
    tone.stop(when + 0.24);
  }

  private warDrum(when: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.48, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.4);
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(82, when);
    o.frequency.exponentialRampToValueAtTime(43, when + 0.42);
    o.connect(g);
    o.start(when);
    o.stop(when + 1.45);

    const clickLen = Math.floor(ctx.sampleRate * 0.045);
    const buf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / clickLen);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const ng = ctx.createGain();
    ng.gain.value = vel * 0.3;
    src.connect(lp).connect(ng).connect(out);
    src.start(when);
  }

  private bell(when: number, freq: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    for (const [ratio, amp, dec] of [
      [1, 0.22, 3.4],
      [2.0, 0.08, 2.2],
      [2.76, 0.06, 1.4],
    ] as const) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel * amp, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dec);
      g.connect(out);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio * 0.5;
      o.connect(g);
      o.start(when);
      o.stop(when + dec + 0.1);
    }
  }

  private timpani(when: number, _freq: number, vel: number, out: GainNode): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 0.5, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.0);
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(mtof(38), when);
    o.frequency.exponentialRampToValueAtTime(mtof(38) * 0.55, when + 0.32);
    o.connect(g);
    o.start(when);
    o.stop(when + 1.1);
    const noiseLen = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const ng = ctx.createGain();
    ng.gain.value = vel * 0.5;
    src.connect(lp).connect(ng).connect(out);
    src.start(when);
  }
}

export class MusicDirector {
  private ctx: AudioContext | null = null;
  private synth: MusicSynth | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;
  private layers: Record<string, Layer> = {};
  private timer: number | undefined;
  // null until the first update() so the initial state always applies
  private zone: MusicZone | null = null;
  private combat = false;
  // try/catch: sandboxed documents throw on the localStorage property access itself
  private _enabled = (() => {
    try {
      return typeof localStorage === 'undefined' || localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
      return true;
    }
  })();
  private _vol = 1; // 0..1 volume, set from the settings menu
  private _menuPaused = false; // temporary mute while the game menu is open
  // Boss-fight override: a looped file track routed through the same AudioContext
  // that user gestures already unlock for the procedural soundtrack.
  private bossActive = false;
  // Sowfield area music: two looped mp3s ('waiting' before a game, 'match' once
  // one has kicked off) that crossfade against each other and duck the procedural
  // score while you stand at the stadium. Same file-track pattern as the boss loop.
  private sowfieldTrack: 'waiting' | 'match' | null = null;

  get enabled(): boolean {
    return this._enabled;
  }

  // master gain target given the enabled flag and volume (base level 0.15).
  // The dedicated Nythraxis track owns the mix while active.
  private masterTarget(): number {
    // No longer ducked for boss fights or the Sowfield. Those used to be authored
    // mp3 layers that silenced this generated score while they played; the tracks
    // are gone, so the procedural music (which carries its own dungeon-boss zone
    // material and the Sowfield's "Boots and Banners") plays through instead.
    if (!this._enabled || this._menuPaused) return 0;
    return 0.15 * this._vol;
  }

  /** Engage/disengage the dedicated boss-fight loop. Idempotent; called every
   *  frame by the HUD. Ducks the procedural score while active. */
  setBossCombat(on: boolean): void {
    this.bossActive = on;
  }

  resetForDungeonEntry(dungeonId: string | null): void {
    if (!dungeonId) return;
    const zone = dungeonMusicZoneForDungeon(dungeonId);
    const layer = this.layers[zone];
    if (layer) {
      layer.anchor = this.ctx?.currentTime ?? 0;
      layer.nextIdx = -1;
      layer.loopCount = 0;
    }
  }

  /** Drive the Sowfield area music: 'waiting' before a game, 'match' once one has
   *  kicked off, null when you are away from the stadium. Idempotent; the HUD calls
   *  it every frame. Crossfades the two tracks and ducks the procedural score while
   *  active. */
  setSowfieldTrack(track: 'waiting' | 'match' | null): void {
    this.sowfieldTrack = track;
  }

  /** Set music volume (0..1). Safe before init(); applied to the master gain. */
  setVolume(v: number): void {
    this._vol = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.masterTarget(), this.ctx.currentTime, 0.2);
    }
  }

  get volume(): number {
    return this._vol;
  }

  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.synth = new MusicSynth(ctx);
    this.master = ctx.createGain();
    this.master.gain.value = this.masterTarget();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.2;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.25;
    this.master.connect(compressor);
    compressor.connect(ctx.destination);

    // generated hall impulse response
    const seconds = 2.6;
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.4;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    const themes = buildMusicThemes();
    for (const [name, theme] of Object.entries(themes)) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      gain.connect(this.reverbSend);
      this.layers[name] = {
        theme,
        gain,
        target: 0,
        anchor: 0,
        nextIdx: -1,
        loopCount: 0,
        transpose: 0,
        trim: THEME_TRIM[name] ?? 1,
      };
    }
    this.timer = window.setInterval(() => this.tickScheduler(), 110);
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.masterTarget(), this.ctx.currentTime, 0.3);
    }
  }

  /** Fade out while the game menu is open; does not change the music toggle. */
  pauseForMenu(): void {
    if (this._menuPaused) return;
    this._menuPaused = true;
    if (!this.ctx) return;
    void this.ctx.resume();
    if (this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
  }

  /** Restore playback after closing the game menu. */
  resumeFromMenu(): void {
    if (!this._menuPaused) return;
    this._menuPaused = false;
    if (!this.ctx) return;
    void this.ctx.resume();
    if (this.master) {
      this.master.gain.setTargetAtTime(this.masterTarget(), this.ctx.currentTime, 0.35);
    }
  }

  // called every frame by the HUD; cheap unless the state changed
  update(zone: MusicZone, inCombat: boolean): void {
    if (!this.ctx) return;
    if (zone === this.zone && inCombat === this.combat) return;
    this.zone = zone;
    this.combat = inCombat;
    const now = this.ctx.currentTime;
    for (const [name, layer] of Object.entries(this.layers)) {
      if (name === 'combat') continue;
      // combat music replaces the zone theme rather than layering over it: the
      // zone is silenced for the duration of combat and fades back in when it ends
      const target = name === zone ? (inCombat ? 0 : 1) : 0;
      if (layer.target !== target) {
        layer.target = target;
        // fade out faster than fade in so instance music doesn't bleed into the world
        const fade = target > 0 ? FADE_SECONDS / 3 : 0.35;
        layer.gain.gain.setTargetAtTime(target * layer.trim, now, fade);
        if (target === 0) layer.nextIdx = -1;
      }
    }
    const combatLayer = this.layers.combat;
    // ostinato follows the zone's tonal center (see COMBAT_TRANSPOSE) — kept
    // current on every zone crossing, not just when combat starts, so being
    // chased across a border can't leave it in the previous zone's key
    if (inCombat) combatLayer.transpose = COMBAT_TRANSPOSE[zone];
    const combatTarget = inCombat ? 1 : 0;
    if (combatLayer.target !== combatTarget) {
      combatLayer.target = combatTarget;
      combatLayer.gain.gain.setTargetAtTime(
        combatTarget * combatLayer.trim,
        now,
        inCombat ? 0.35 : FADE_SECONDS / 3,
      );
    }
  }

  private tickScheduler(): void {
    const ctx = this.ctx;
    if (!ctx || !this._enabled) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (const layer of Object.values(this.layers)) {
      // schedule only active layers — don't keep pumping long dungeon notes
      // while a fading-out gain node is still above zero
      if (layer.target <= 0.001) {
        layer.nextIdx = -1;
        continue;
      }
      const spb = 60 / layer.theme.bpm;
      const loopBeats = layer.theme.bars * 4;
      if (layer.nextIdx === -1) {
        layer.anchor = ctx.currentTime + 0.15;
        layer.nextIdx = 0;
        layer.loopCount = 0;
      }
      for (let guard = 0; guard < 220; guard++) {
        const evt = layer.theme.events[layer.nextIdx];
        const when = layer.anchor + (layer.loopCount * loopBeats + evt.beat) * spb;
        if (when > horizon) break;
        if (when >= ctx.currentTime - 0.03) {
          this.synth!.playNote(evt, when, spb, layer);
        }
        layer.nextIdx++;
        if (layer.nextIdx >= layer.theme.events.length) {
          layer.nextIdx = 0;
          layer.loopCount++;
        }
      }
    }
  }
}

export const music = new MusicDirector();
