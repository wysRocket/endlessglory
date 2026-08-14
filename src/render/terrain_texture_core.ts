// Deterministic generator for the stylized terrain splat textures.
//
// The shipped splat layers were photographic PBR scans (ambientCG 1K), which is
// the one surface a player looks at constantly and the loudest remaining break
// from the low-poly cast standing on it. Photoreal ground under hand-painted
// characters is what playtesting flagged first.
//
// Generating the ground in code instead of sourcing or prompting for it buys
// three things no image source can promise:
//   - Exact tiling. Every noise lattice here is periodic, so the texture wraps
//     by construction rather than by a seam-blend that only hides the seam.
//   - Exact palette agreement. Every stop runs through the SAME houseColor
//     policy the character and prop materials run through, so the ground cannot
//     drift away from the cast it sits under.
//   - Reproducibility. Seeded integer hashing throughout, no Math.random, so a
//     regenerated texture is byte-identical and reviewable as a diff of code.
//
// This module is pure: no Three, no DOM, no image encoding. It returns raw
// texel buffers; scripts/gen_terrain_textures.ts is the thin consumer that
// writes them to PNG with sharp.
//
// Authoring scale: terrain.ts samples these at `tuv = vWPos.xz * 0.22`, so one
// tile spans about 4.55 world yards. At 1024px that is roughly 4.4mm per texel,
// which is why the stylization lever here is broad posterized shape rather than
// fine surface detail: detail at that scale is invisible at gameplay camera
// distance and only reads as noise.

import {
  HOUSE_LIGHTNESS_MAX,
  HOUSE_LIGHTNESS_MIN,
  houseColor,
  hslToRgb,
  rgbToHsl,
} from './house_style_core';

/** Ground sits in a narrower lightness band than the house band allows. It is a
 *  backdrop: it must never flash brighter than a character standing on it, nor
 *  crush to a silhouette-eating black. Both bounds are strictly inside the house
 *  band (pinned by tests/terrain_texture_core.test.ts). */
export const TERRAIN_LIGHTNESS_MIN = 0.3;
export const TERRAIN_LIGHTNESS_MAX = 0.72;

/** Ceiling the authored stops are held under so the ground stays a backdrop and
 *  the cast keeps the loudest chroma on screen. Enforced by test over every
 *  produced texel rather than by a clamp, so an over-saturated stop fails loudly
 *  at authoring time instead of being silently squashed. */
export const TERRAIN_SATURATION_MAX = 0.42;

export type TerrainPattern = 'patchy' | 'plated' | 'rippled' | 'drifted';

export interface TerrainLayerSpec {
  /** Splat key this layer feeds in terrain.ts. */
  key: string;
  /** Output filename stem, before the _Color / _NormalGL suffix. */
  stem: string;
  /** Palette stops, darkest first, as sRGB hex. */
  stops: string[];
  /** Posterization level count. This is the stylization lever: few bands reads
   *  as flat hand-painted, many bands reads as a photograph. */
  bands: number;
  /** Noise lattice cells across the tile at the first octave. Must be an
   *  integer: that is what makes the lattice wrap at the tile edge. */
  basePeriod: number;
  octaves: number;
  /** Domain warp strength, in lattice cells. Warping a periodic field by a
   *  periodic field stays periodic, so this cannot break tiling. */
  warp: number;
  /** Within-band tonal variation. Kept small: the bands are the look. */
  grain: number;
  /** Height amplitude feeding the normal map. */
  relief: number;
  pattern: TerrainPattern;
  /** Feature cells across the tile (tufts, pebbles, plates, drifts). */
  featureCells: number;
  /** Strength of the sparse tuft/pebble scatter. Zero for the layers where any
   *  scatter at all reads as dirt on the lens rather than as ground. */
  speck: number;
  /** Wind-ripple amplitude, rippled pattern only. Small on purpose: a strong
   *  sine over a posterized field stops reading as sand and starts reading as
   *  wood grain. */
  ripple: number;
  /** Tone contrast expansion applied before posterizing. Mixing two noise
   *  fields averages away variance (the sum of two random fields concentrates
   *  toward the mean), so without re-expanding, the tone never reaches the outer
   *  bands and the layer collapses toward a single flat fill. */
  contrast: number;
  /** Deterministic per-layer seed. */
  seed: number;
  /** Whether the shader samples a normal map for this layer. mud and snow are
   *  albedo-only in terrain.ts, so generating normals for them would ship two
   *  unread megabytes. */
  normals: boolean;
}

/** The six splat layers, matching the sampler set in terrain.ts. Data-as-code:
 *  this table is meant to be big and declarative. */
export const TERRAIN_LAYERS: TerrainLayerSpec[] = [
  {
    key: 'grass',
    stem: 'StylizedGrass',
    stops: ['#46653a', '#537444', '#61834e', '#6f9159'],
    bands: 4,
    basePeriod: 8,
    octaves: 4,
    warp: 1.6,
    grain: 0.05,
    relief: 0.55,
    pattern: 'patchy',
    featureCells: 48,
    speck: 0.22,
    ripple: 0,
    contrast: 1.5,
    seed: 1301,
    normals: true,
  },
  {
    key: 'dirt',
    stem: 'StylizedDirt',
    stops: ['#4c3b2c', '#5a4835', '#68553f', '#76624a'],
    bands: 4,
    basePeriod: 8,
    octaves: 4,
    warp: 1.9,
    grain: 0.06,
    relief: 0.7,
    pattern: 'patchy',
    featureCells: 34,
    speck: 0.18,
    ripple: 0,
    contrast: 1.9,
    seed: 2207,
    normals: true,
  },
  {
    key: 'rock',
    stem: 'StylizedRock',
    stops: ['#4d5054', '#5a5d61', '#686b6f', '#767a7e'],
    bands: 4,
    basePeriod: 4,
    octaves: 3,
    warp: 1.2,
    grain: 0.05,
    relief: 1,
    pattern: 'plated',
    featureCells: 9,
    speck: 0.0,
    ripple: 0,
    contrast: 1.0,
    seed: 3313,
    normals: true,
  },
  {
    key: 'sand',
    stem: 'StylizedSand',
    stops: ['#8b7c5b', '#988967', '#a49674', '#b0a281'],
    bands: 3,
    basePeriod: 8,
    octaves: 3,
    warp: 0.7,
    grain: 0.04,
    relief: 0.4,
    pattern: 'rippled',
    featureCells: 26,
    speck: 0.05,
    ripple: 0.07,
    contrast: 1.5,
    seed: 4409,
    normals: true,
  },
  {
    key: 'mud',
    stem: 'StylizedMud',
    stops: ['#372f25', '#463c30', '#564a3c', '#675948'],
    bands: 4,
    basePeriod: 8,
    octaves: 4,
    warp: 2.2,
    grain: 0.06,
    relief: 0.5,
    pattern: 'patchy',
    featureCells: 20,
    speck: 0.16,
    ripple: 0,
    contrast: 2.0,
    seed: 5503,
    normals: false,
  },
  {
    key: 'snow',
    stem: 'StylizedSnow',
    stops: ['#9fa8b0', '#b1b9c0', '#c2c9cf', '#d1d7dc'],
    bands: 3,
    basePeriod: 4,
    octaves: 3,
    warp: 0.9,
    grain: 0.03,
    relief: 0.35,
    pattern: 'drifted',
    featureCells: 12,
    speck: 0.04,
    ripple: 0,
    contrast: 1.7,
    seed: 6607,
    normals: false,
  },
];

// ---------------------------------------------------------------------------
// sRGB transfer, matching three's own conversion. The palette work happens in
// encoded space because saturation and lightness are perceptual ideas: clamping
// them on raw linear components crushes mid-tones.
// ---------------------------------------------------------------------------

function encodeSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function decodeSrgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** HSL of an sRGB byte triple, for palette assertions over produced texels. */
export function rgbToHslBytes(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  return rgbToHsl(r / 255, g / 255, b / 255);
}

/** Parse an sRGB hex stop to non-linear rgb in 0..1. */
export function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: Number.parseInt(h.slice(0, 2), 16) / 255,
    g: Number.parseInt(h.slice(2, 4), 16) / 255,
    b: Number.parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** Run an authored stop through the shared house palette policy, then narrow it
 *  into the terrain lightness band. Both steps are lightness clamps plus the
 *  house saturation knee, so the result is stable under reapplication and the
 *  ordering of two stops is preserved. */
export function terrainHarmonize(c: Rgb): Rgb {
  const lin = houseColor(decodeSrgb(c.r), decodeSrgb(c.g), decodeSrgb(c.b), false);
  const enc = rgbToHsl(encodeSrgb(lin.r), encodeSrgb(lin.g), encodeSrgb(lin.b));
  const out = hslToRgb(enc.h, enc.s, clamp(enc.l, TERRAIN_LIGHTNESS_MIN, TERRAIN_LIGHTNESS_MAX));
  return out;
}

// ---------------------------------------------------------------------------
// Periodic noise. Every lattice index is taken modulo the octave period, so the
// field is exactly periodic over the tile and the texture wraps with no seam.
// ---------------------------------------------------------------------------

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function wrap(i: number, period: number): number {
  return ((i % period) + period) % period;
}

/** Value noise on a wrapping lattice. `u`,`v` are in tile units (0..1). */
function periodicNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);
  const xa = wrap(x0, period);
  const xb = wrap(x0 + 1, period);
  const ya = wrap(y0, period);
  const yb = wrap(y0 + 1, period);
  const n00 = hash2(xa, ya, seed);
  const n10 = hash2(xb, ya, seed);
  const n01 = hash2(xa, yb, seed);
  const n11 = hash2(xb, yb, seed);
  return (n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy;
}

/** Fractal sum of periodic noise. Each octave doubles the lattice period, so
 *  every octave wraps and therefore so does the sum. */
export function periodicFbm(
  u: number,
  v: number,
  basePeriod: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(u, v, basePeriod * 2 ** o, seed + o * 131);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Wrapping Worley. Returns the two nearest feature-point distances (in cell
 *  units) and the nearest cell's own hash, which the plated pattern uses to
 *  pick a per-plate tone. */
function periodicWorley(
  u: number,
  v: number,
  cells: number,
  seed: number,
): { f1: number; f2: number; id: number } {
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      const wx = wrap(gx, cells);
      const wy = wrap(gy, cells);
      const px = gx + hash2(wx, wy, seed);
      const py = gy + hash2(wx, wy, seed + 977);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(wx, wy, seed + 1553);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, id };
}

// ---------------------------------------------------------------------------
// Layer fields. Each pattern returns a tone in 0..1 (which band to land in) and
// a height in roughly 0..1 for the normal map. Albedo and height come from the
// same field so the relief always agrees with the paint.
// ---------------------------------------------------------------------------

function layerField(
  spec: TerrainLayerSpec,
  u: number,
  v: number,
): { tone: number; height: number } {
  // Domain warp, shared by every pattern.
  const wu =
    u +
    (periodicFbm(u, v, spec.basePeriod, 2, spec.seed + 31) - 0.5) * (spec.warp / spec.basePeriod);
  const wv =
    v +
    (periodicFbm(u, v, spec.basePeriod, 2, spec.seed + 67) - 0.5) * (spec.warp / spec.basePeriod);
  const base = periodicFbm(wu, wv, spec.basePeriod, spec.octaves, spec.seed);

  if (spec.pattern === 'plated') {
    const w = periodicWorley(wu, wv, spec.featureCells, spec.seed + 211);
    // Crack darkening: narrow where the two nearest plates are equidistant.
    const edge = clamp((w.f2 - w.f1) / 0.18, 0, 1);
    // Plate tones are compressed away from pure black and the cracks only
    // darken partway: a full-range plate id plus a full-strength crack reads as
    // cracked dried mud rather than as stone.
    const tone = clamp(0.35 + w.id * 0.45 + base * 0.2, 0, 1) * (0.66 + 0.34 * edge);
    const height = clamp(w.id * 0.5 + base * 0.3 + edge * 0.4, 0, 1);
    return { tone, height };
  }

  // Every remaining pattern mixes in a much lower-frequency term. Posterizing a
  // single-scale field gives every blob the same size, which is the signature of
  // camouflage rather than ground: the macro term shifts whole regions across a
  // band boundary, so large areas of one tone carry smaller detail inside them.
  const macro = periodicFbm(
    wu,
    wv,
    Math.max(2, Math.round(spec.basePeriod / 4)),
    2,
    spec.seed + 53,
  );

  if (spec.pattern === 'rippled') {
    // Ripples run diagonally so they never read as scanlines, and the integer
    // axis multipliers keep the sine periodic over the tile (a non-integer
    // direction would tile the noise but not the ripple, reopening the seam).
    const ax = Math.max(1, Math.round(spec.featureCells * 0.35));
    const az = Math.max(1, Math.round(spec.featureCells * 0.94));
    const phase = (ax * wu + az * wv) * Math.PI * 2 + base * 5.5;
    const ripple = 0.5 + 0.5 * Math.sin(phase);
    const tone = clamp(base * 0.5 + macro * 0.5 + (ripple - 0.5) * spec.ripple, 0, 1);
    return { tone, height: clamp(base * 0.45 + macro * 0.3 + ripple * 0.25, 0, 1) };
  }

  if (spec.pattern === 'drifted') {
    const tone = clamp(base * 0.4 + macro * 0.6, 0, 1);
    return { tone, height: tone };
  }

  // patchy: multi-scale tonal patches plus a sparse scatter of tufts or pebbles.
  const w = periodicWorley(wu, wv, spec.featureCells, spec.seed + 401);
  // Only the tightest cores become features, which is what keeps them sparse.
  const speck = clamp(1 - w.f1 / 0.34, 0, 1) * (w.id > 0.62 ? 1 : 0);
  const patch = base * 0.58 + macro * 0.42;
  const tone = clamp(patch + speck * spec.speck * (w.id > 0.82 ? 1 : -1), 0, 1);
  const height = clamp(patch * 0.7 + speck * spec.speck * 2.2, 0, 1);
  return { tone, height };
}

// ---------------------------------------------------------------------------
// Texel generation
// ---------------------------------------------------------------------------

export interface TerrainTexels {
  size: number;
  /** size*size*3, sRGB bytes. */
  albedo: Uint8Array;
  /** size*size*3, GL-convention tangent-space normal bytes, or null when the
   *  shader does not sample a normal for this layer. */
  normal: Uint8Array | null;
}

/** Resolve a layer's palette once, harmonized. Exposed so the palette tests can
 *  assert over exactly the colours the generator will use. */
export function harmonizedStops(spec: TerrainLayerSpec): Rgb[] {
  return spec.stops.map((hex) => terrainHarmonize(parseHex(hex)));
}

/**
 * Generate one layer's albedo and (optionally) its normal map.
 *
 * Tiling is exact at ANY `size`. The fields are periodic in tile units with
 * period 1 (a lattice index is taken modulo its period, so u=0 and u=1 hash the
 * same corner), which makes the sampled row exactly periodic no matter how many
 * texels it is sampled at. What tiling DOES require is that every period in
 * play is an integer, which is why the periods here are integers rather than
 * tuned floats.
 */
export function generateTerrainLayer(spec: TerrainLayerSpec, size: number): TerrainTexels {
  const stops = harmonizedStops(spec);
  const albedo = new Uint8Array(size * size * 3);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const { tone: rawTone, height: h } = layerField(spec, u, v);
      const tone = clamp(0.5 + (rawTone - 0.5) * spec.contrast, 0, 1);

      // Posterize into bands. The pre-quantize jitter keeps band edges from
      // reading as contour lines on a map, but it has to stay LOW frequency: a
      // per-texel jitter dithers the boundary into stipple (which reads as dirt
      // on the lens), where a few-cells-wide one makes the edge wobble like a
      // brush stroke, which is the look being aimed at.
      const jitter =
        (periodicFbm(u, v, spec.basePeriod * 6, 2, spec.seed + 7) - 0.5) * (1 / spec.bands) * 0.8;
      const level = clamp(Math.floor((tone + jitter) * spec.bands), 0, spec.bands - 1);
      const stop = stops[Math.min(level, stops.length - 1)];

      // Small within-band variation so a band is not a dead flat fill.
      const g =
        1 + (periodicFbm(u, v, spec.basePeriod * 4, 2, spec.seed + 13) - 0.5) * spec.grain * 2;

      const i = (y * size + x) * 3;
      albedo[i] = clamp(Math.round(stop.r * g * 255), 0, 255);
      albedo[i + 1] = clamp(Math.round(stop.g * g * 255), 0, 255);
      albedo[i + 2] = clamp(Math.round(stop.b * g * 255), 0, 255);
      height[y * size + x] = h;
    }
  }

  if (!spec.normals) return { size, albedo, normal: null };

  // Central differences with wrapping indices, so the normal map tiles too.
  const normal = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + wrap(x - 1, size)];
      const r = height[y * size + wrap(x + 1, size)];
      const d = height[wrap(y - 1, size) * size + x];
      const t = height[wrap(y + 1, size) * size + x];
      // Scale the gradient by the layer relief; the shader only reads xy.
      const nx = (l - r) * spec.relief * size * 0.012;
      const ny = (d - t) * spec.relief * size * 0.012;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 3;
      normal[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    }
  }
  return { size, albedo, normal };
}

/** Sanity bound used by both the tests and the generator script. */
export const HOUSE_BAND = { min: HOUSE_LIGHTNESS_MIN, max: HOUSE_LIGHTNESS_MAX };
