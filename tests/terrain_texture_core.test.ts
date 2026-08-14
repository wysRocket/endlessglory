import { describe, expect, it } from 'vitest';
import {
  generateTerrainLayer,
  HOUSE_BAND,
  harmonizedStops,
  periodicFbm,
  rgbToHslBytes,
  TERRAIN_LAYERS,
  TERRAIN_LIGHTNESS_MAX,
  TERRAIN_LIGHTNESS_MIN,
  TERRAIN_SATURATION_MAX,
  type TerrainLayerSpec,
} from '../src/render/terrain_texture_core';

// Small enough to keep the suite fast; tiling is exact at any size (the fields
// are periodic in tile units), so a 128px tile proves the same property a
// 1024px one does.
const SIZE = 128;

function layer(key: string): TerrainLayerSpec {
  const spec = TERRAIN_LAYERS.find((l) => l.key === key);
  if (!spec) throw new Error(`no layer ${key}`);
  return spec;
}

/** Mean absolute channel difference between two columns of an rgb buffer. */
function columnDelta(buf: Uint8Array, size: number, ax: number, bx: number): number {
  let sum = 0;
  for (let y = 0; y < size; y++) {
    const ia = (y * size + ax) * 3;
    const ib = (y * size + bx) * 3;
    sum +=
      Math.abs(buf[ia] - buf[ib]) +
      Math.abs(buf[ia + 1] - buf[ib + 1]) +
      Math.abs(buf[ia + 2] - buf[ib + 2]);
  }
  return sum / (size * 3);
}

function rowDelta(buf: Uint8Array, size: number, ay: number, by: number): number {
  let sum = 0;
  for (let x = 0; x < size; x++) {
    const ia = (ay * size + x) * 3;
    const ib = (by * size + x) * 3;
    sum +=
      Math.abs(buf[ia] - buf[ib]) +
      Math.abs(buf[ia + 1] - buf[ib + 1]) +
      Math.abs(buf[ia + 2] - buf[ib + 2]);
  }
  return sum / (size * 3);
}

describe('terrain texture core: tiling', () => {
  // The seam test that matters. A texture "looks seamless" whenever the wrap
  // discontinuity is no larger than the ordinary texel-to-texel change inside
  // the tile, so the wrap delta is compared against an interior control rather
  // than against zero: a threshold against zero would fail every textured
  // surface, and a threshold that is merely small would pass a blurred seam.
  for (const spec of TERRAIN_LAYERS) {
    it(`${spec.key} albedo wraps with no seam`, () => {
      const { albedo } = generateTerrainLayer(spec, SIZE);
      const wrapX = columnDelta(albedo, SIZE, SIZE - 1, 0);
      const controlX = columnDelta(albedo, SIZE, SIZE - 2, SIZE - 1);
      const wrapY = rowDelta(albedo, SIZE, SIZE - 1, 0);
      const controlY = rowDelta(albedo, SIZE, SIZE - 2, SIZE - 1);
      // Allow the wrap edge to be up to 1.5x a normal interior step. A real
      // seam runs many multiples above it, not a fraction.
      expect(wrapX).toBeLessThanOrEqual(controlX * 1.5 + 1);
      expect(wrapY).toBeLessThanOrEqual(controlY * 1.5 + 1);
    });
  }

  it('normal maps wrap too, so relief does not crack at the tile edge', () => {
    for (const spec of TERRAIN_LAYERS.filter((l) => l.normals)) {
      const { normal } = generateTerrainLayer(spec, SIZE);
      expect(normal).not.toBeNull();
      if (!normal) continue;
      const wrapX = columnDelta(normal, SIZE, SIZE - 1, 0);
      const controlX = columnDelta(normal, SIZE, SIZE - 2, SIZE - 1);
      expect(wrapX).toBeLessThanOrEqual(controlX * 1.5 + 1);
    }
  });

  it('the underlying noise is exactly periodic, not merely close', () => {
    // u=0 and u=1 are the same point on the lattice, so this is an equality,
    // not a tolerance. This is the property the wrap tests above rest on.
    for (let i = 0; i < 8; i++) {
      const v = i / 8;
      expect(periodicFbm(0, v, 8, 4, 1301)).toBe(periodicFbm(1, v, 8, 4, 1301));
      expect(periodicFbm(v, 0, 8, 4, 1301)).toBe(periodicFbm(v, 1, 8, 4, 1301));
    }
  });
});

describe('terrain texture core: palette agreement', () => {
  it('the terrain lightness band sits strictly inside the house band', () => {
    // The whole coherence claim is that ground obeys the same policy as the
    // cast. A terrain band that escaped the house band would silently break it.
    expect(TERRAIN_LIGHTNESS_MIN).toBeGreaterThan(HOUSE_BAND.min);
    expect(TERRAIN_LIGHTNESS_MAX).toBeLessThan(HOUSE_BAND.max);
  });

  it('every harmonized stop lands in the terrain band', () => {
    for (const spec of TERRAIN_LAYERS) {
      for (const [i, stop] of harmonizedStops(spec).entries()) {
        const hsl = rgbToHslBytes(stop.r * 255, stop.g * 255, stop.b * 255);
        expect(hsl.l, `${spec.key} stop ${i} lightness`).toBeGreaterThanOrEqual(
          TERRAIN_LIGHTNESS_MIN - 1e-6,
        );
        expect(hsl.l, `${spec.key} stop ${i} lightness`).toBeLessThanOrEqual(
          TERRAIN_LIGHTNESS_MAX + 1e-6,
        );
        expect(hsl.s, `${spec.key} stop ${i} saturation`).toBeLessThanOrEqual(
          TERRAIN_SATURATION_MAX,
        );
      }
    }
  });

  it('no produced texel exceeds the ground saturation ceiling', () => {
    // Asserted over real texels, not just the stops: the within-band grain
    // multiplier scales rgb, which moves saturation as well as lightness.
    for (const spec of TERRAIN_LAYERS) {
      const { albedo } = generateTerrainLayer(spec, 64);
      let worst = 0;
      for (let i = 0; i < albedo.length; i += 3) {
        const hsl = rgbToHslBytes(albedo[i], albedo[i + 1], albedo[i + 2]);
        if (hsl.s > worst) worst = hsl.s;
      }
      expect(worst, `${spec.key} peak saturation`).toBeLessThanOrEqual(TERRAIN_SATURATION_MAX);
    }
  });

  it('layers stay within one value family of each other', () => {
    // "Agree in value" made measurable: the mean lightness of the six layers
    // must not spread wider than the terrain band itself. Snow is the brightest
    // and mud the darkest, so this is the pair that actually binds.
    const means = TERRAIN_LAYERS.map((spec) => {
      const { albedo } = generateTerrainLayer(spec, 64);
      let sum = 0;
      let n = 0;
      for (let i = 0; i < albedo.length; i += 3) {
        sum += rgbToHslBytes(albedo[i], albedo[i + 1], albedo[i + 2]).l;
        n++;
      }
      return sum / n;
    });
    const spread = Math.max(...means) - Math.min(...means);
    expect(spread).toBeLessThanOrEqual(TERRAIN_LIGHTNESS_MAX - TERRAIN_LIGHTNESS_MIN);
  });
});

describe('terrain texture core: contract with terrain.ts', () => {
  it('covers exactly the six splat samplers', () => {
    expect(TERRAIN_LAYERS.map((l) => l.key).sort()).toEqual([
      'dirt',
      'grass',
      'mud',
      'rock',
      'sand',
      'snow',
    ]);
  });

  it('generates normals for the four layers the shader samples them for', () => {
    // terrain.ts binds uGrassN/uDirtN/uRockN/uSandN only; mud and snow are
    // albedo-only, so shipping normals for them would be dead weight.
    const withNormals = TERRAIN_LAYERS.filter((l) => l.normals)
      .map((l) => l.key)
      .sort();
    expect(withNormals).toEqual(['dirt', 'grass', 'rock', 'sand']);
    for (const spec of TERRAIN_LAYERS) {
      const { normal } = generateTerrainLayer(spec, 32);
      expect(normal === null, `${spec.key} normal presence`).toBe(!spec.normals);
    }
  });

  it('normals point out of the surface', () => {
    // A tangent-space normal whose z dips below the midpoint would light the
    // ground as if it faced away from the sun.
    const { normal } = generateTerrainLayer(layer('rock'), 64);
    if (!normal) throw new Error('expected rock normals');
    for (let i = 2; i < normal.length; i += 3) expect(normal[i]).toBeGreaterThan(128);
  });
});

describe('terrain texture core: determinism', () => {
  it('regenerates byte-identically', () => {
    // The generator is the asset's source of truth, so a rebuild has to be a
    // no-op in git. Any Math.random or time dependence would surface here.
    for (const spec of TERRAIN_LAYERS) {
      const a = generateTerrainLayer(spec, 64);
      const b = generateTerrainLayer(spec, 64);
      expect(Buffer.from(a.albedo).equals(Buffer.from(b.albedo))).toBe(true);
      if (a.normal && b.normal) {
        expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
      }
    }
  });

  it('distinct seeds produce distinct layers', () => {
    // Guards against a spec field being ignored, which would silently ship six
    // copies of one texture in six palettes.
    const grass = generateTerrainLayer(layer('grass'), 64);
    const dirt = generateTerrainLayer(layer('dirt'), 64);
    expect(Buffer.from(grass.albedo).equals(Buffer.from(dirt.albedo))).toBe(false);
  });
});
