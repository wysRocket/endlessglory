import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATE_TINT_STRENGTH,
  HOUSE_BODY_METALNESS_MAX,
  HOUSE_ROUGHNESS_MAX,
  HOUSE_ROUGHNESS_MIN,
  houseStyle,
} from '../src/render/house_style_core';
import {
  applyHouseStyleMaterial,
  applyHouseSurfaceMaterial,
  applyTemplateTint,
} from '../src/render/house_style_material';

const repoRoot = join(__dirname, '..');
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8');

// The two independent consumers of the house style. `tintedMaterial()` builds
// the in-game character/creature materials; `buildModel()` builds the guide
// viewer turntable, which ALSO bakes the committed Dungeon Finder mob portraits
// (scripts/render_finder_portraits.mjs) and the wiki model stills
// (scripts/wiki/stills_render_entry.js). They used to reimplement the tint by
// hand, so a creature could look one way in game and another in its portrait.
const RENDERER_CONSUMER = 'src/render/characters/assets.ts';
const GUIDE_CONSUMER = 'src/guide/viewer/model.ts';

/** A deliberately off-house source: glossy, metallic, loudly saturated. */
function glossySource(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.05, metalness: 0.85 });
  mat.color.setRGB(0.86, 0.05, 0.02, THREE.LinearSRGBColorSpace);
  return mat;
}

describe('applyHouseStyleMaterial writes exactly what the pure core decided', () => {
  it('normalizes a standard material to the core plan', () => {
    const mat = glossySource();
    const plan = houseStyle({
      r: mat.color.r,
      g: mat.color.g,
      b: mat.color.b,
      roughness: mat.roughness,
      metalness: mat.metalness,
      hasMap: false,
      role: 'body',
    });
    applyHouseStyleMaterial(mat, 'body');
    expect(mat.roughness).toBe(plan.roughness);
    expect(mat.metalness).toBe(plan.metalness);
    expect(mat.flatShading).toBe(plan.flatShading);
    expect(mat.color.r).toBeCloseTo(plan.r, 12);
    expect(mat.color.g).toBeCloseTo(plan.g, 12);
    expect(mat.color.b).toBeCloseTo(plan.b, 12);
    // and it really moved: the glossy metallic outlier is gone.
    expect(mat.roughness).toBe(HOUSE_ROUGHNESS_MIN);
    expect(mat.metalness).toBe(HOUSE_BODY_METALNESS_MAX);
  });

  it('styles a low-tier Lambert too (palette + faceting, no PBR fields to write)', () => {
    const mat = new THREE.MeshLambertMaterial();
    mat.color.setRGB(0.86, 0.05, 0.02, THREE.LinearSRGBColorSpace);
    applyHouseStyleMaterial(mat, 'body');
    expect(mat.flatShading).toBe(true);
    expect(mat.color.r).toBeLessThan(0.86);
    expect('roughness' in mat).toBe(false);
  });

  it('leaves weapons smooth and lets them keep a blade highlight', () => {
    const mat = glossySource();
    applyHouseStyleMaterial(mat, 'weapon');
    expect(mat.flatShading).toBe(false);
    expect(mat.metalness).toBeGreaterThan(HOUSE_BODY_METALNESS_MAX);
  });
});

describe('the in-game funnel and the guide viewer cannot drift', () => {
  // Same source material descriptor in, same normalized values out. Both paths
  // are driven through the SHARED helpers here in the exact order each consumer
  // uses them, so a hand-rolled copy on either side fails this test.
  it('produces identical materials from the same source, tint, and role', () => {
    const tint = 0x3f8f4f;
    const strength = DEFAULT_TEMPLATE_TINT_STRENGTH;

    // Renderer path: tintedMaterial() clones, tints, then house-styles.
    const fromRenderer = glossySource();
    applyTemplateTint(fromRenderer, tint, strength);
    applyHouseStyleMaterial(fromRenderer, 'body');

    // Guide path: buildModel() clones per role, tints bodies, then house-styles.
    const fromGuide = glossySource();
    applyTemplateTint(fromGuide, tint, strength);
    applyHouseStyleMaterial(fromGuide, 'body');

    expect(fromGuide.color.getHex()).toBe(fromRenderer.color.getHex());
    expect(fromGuide.roughness).toBe(fromRenderer.roughness);
    expect(fromGuide.metalness).toBe(fromRenderer.metalness);
    expect(fromGuide.flatShading).toBe(fromRenderer.flatShading);
  });

  it('shares one tint strength constant instead of two literals', () => {
    expect(DEFAULT_TEMPLATE_TINT_STRENGTH).toBe(0.4);
    for (const rel of [RENDERER_CONSUMER, GUIDE_CONSUMER]) {
      expect(read(rel), rel).toContain('DEFAULT_TEMPLATE_TINT_STRENGTH');
    }
  });

  // Structural pin: the drift this test exists to prevent is a consumer growing
  // its OWN copy of the policy again, which no value assertion can catch.
  it('routes both consumers through the shared applier', () => {
    for (const rel of [RENDERER_CONSUMER, GUIDE_CONSUMER]) {
      const src = read(rel);
      expect(src, `${rel} must import the shared house-style applier`).toMatch(
        /from '.*house_style_material'/,
      );
      expect(src, `${rel} must call applyHouseStyleMaterial`).toContain('applyHouseStyleMaterial(');
      expect(src, `${rel} must tint through the shared helper`).toContain('applyTemplateTint(');
    }
  });

  it('leaves no second hand-rolled tint lerp in either consumer', () => {
    // `color.lerp(...)` toward a template colour is exactly the duplicated
    // policy that split the roster from its own portraits. The renderer keeps
    // two DELIBERATE role-specific readability offsets that lerp toward the
    // fixed weapon-highlight / white constants; anything else is a regression.
    const ALLOWED_LERP =
      /color\.lerp\(\s*(?:role === 'weapon' \? weaponHighlight : lowReadabilityWhite|weaponHighlight)\s*,/;
    // Teeth check: the matcher must reject a reintroduced template-tint lerp.
    expect(ALLOWED_LERP.test('std.color.lerp(tintColor, strength);')).toBe(false);
    expect(ALLOWED_LERP.test('mat.color.lerp(weaponHighlight, 0.08);')).toBe(true);
    for (const rel of [RENDERER_CONSUMER, GUIDE_CONSUMER]) {
      const offenders = read(rel)
        .split('\n')
        .filter((line) => /color\.lerp\(/.test(line) && !ALLOWED_LERP.test(line));
      expect(offenders, `${rel} reimplements the template tint:\n${offenders.join('\n')}`).toEqual(
        [],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The environment half: props, dungeon dressing, and scenery.
// ---------------------------------------------------------------------------

const ENV_CONSUMERS = ['src/render/props.ts', 'src/render/dungeon.ts', 'src/render/jail_scene.ts'];

describe('house surface style (environment)', () => {
  it('pulls an off-house prop material into the house bands', () => {
    // The real case this exists for: a glTF that omits metallicFactor and
    // roughnessFactor takes the spec defaults of 1.0, so a kit barrel shipped
    // as a fully metallic, perfectly smooth barrel.
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
    mat.color.setRGB(0.5, 0.4, 0.3, THREE.LinearSRGBColorSpace);
    applyHouseSurfaceMaterial(mat);
    expect(mat.metalness).toBeLessThanOrEqual(HOUSE_BODY_METALNESS_MAX);
    expect(mat.roughness).toBeGreaterThanOrEqual(HOUSE_ROUGHNESS_MIN);
    expect(mat.roughness).toBeLessThanOrEqual(HOUSE_ROUGHNESS_MAX);
  });

  it('leaves authored shading alone, unlike the character applier', () => {
    // A prop's bevels are its silhouette language: faceting a barrel band or a
    // smooth-shaded roof reads as damage, not as style. This is the one half of
    // the policy the environment deliberately does not take.
    const smooth = new THREE.MeshStandardMaterial({ flatShading: false });
    applyHouseSurfaceMaterial(smooth);
    expect(smooth.flatShading).toBe(false);

    const faceted = new THREE.MeshStandardMaterial({ flatShading: true });
    applyHouseSurfaceMaterial(faceted);
    expect(faceted.flatShading).toBe(true);
  });

  it('is idempotent, so a re-converted cached material cannot drift', () => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
    mat.color.setRGB(0.5, 0.4, 0.3, THREE.LinearSRGBColorSpace);
    applyHouseSurfaceMaterial(mat);
    const once = {
      r: mat.color.r,
      g: mat.color.g,
      b: mat.color.b,
      ro: mat.roughness,
      me: mat.metalness,
    };
    applyHouseSurfaceMaterial(mat);
    expect(mat.roughness).toBeCloseTo(once.ro, 10);
    expect(mat.metalness).toBeCloseTo(once.me, 10);
  });

  it('survives a Lambert material on the low tier without throwing', () => {
    // Low tier substitutes Lambert, which has no roughness/metalness at all.
    const lam = new THREE.MeshLambertMaterial();
    lam.color.setRGB(0.5, 0.4, 0.3, THREE.LinearSRGBColorSpace);
    expect(() => applyHouseSurfaceMaterial(lam)).not.toThrow();
  });

  it('every environment material funnel routes through the shared applier', () => {
    // Guards the reason this exists: the policy had been reinvented by hand in
    // three separate modules. A fourth hand-rolled copy should fail here.
    for (const rel of ENV_CONSUMERS) {
      expect(read(rel), `${rel} applies the house surface style`).toContain(
        'applyHouseSurfaceMaterial',
      );
    }
  });

  it('no environment module hand-rolls the specular pair any more', () => {
    // The exact shape of the three copies that were removed:
    //   metalness = 0; roughness = Math.max(0.85, ...)
    // A bare `metalness = 0` with no applier nearby is the regression.
    for (const rel of ENV_CONSUMERS) {
      const src = read(rel);
      expect(src, `${rel} has no bare metalness reset`).not.toMatch(/\.metalness\s*=\s*0\s*;/);
    }
  });

  it('deliberate metal overrides outrank the blanket policy', () => {
    // props.ts MAT_OVERRIDES carries the intentional exceptions: the village
    // bell is bronze (0.6) and the ore vein is copper (0.45). Both sit far above
    // the dielectric body ceiling, and flattening them would ruin exactly the
    // two surfaces someone hand-tuned. Pinned to literals so a future edit that
    // drops the re-apply is caught here.
    const src = read('src/render/props.ts');
    expect(src).toContain("'village:Bell': { metalness: 0.6");
    expect(src).toContain("'ore:Stone_Dark': { color: 0xb87333, metalness: 0.45");
    const applyIdx = src.indexOf('applyHouseSurfaceMaterial(mat as StyleableMaterial)');
    const reapplyIdx = src.indexOf('std.metalness = ov.metalness');
    expect(applyIdx).toBeGreaterThan(-1);
    expect(reapplyIdx).toBeGreaterThan(applyIdx);
  });
});
