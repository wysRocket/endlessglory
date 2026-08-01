import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/ui/theme';

const CSS = readFileSync(resolve(__dirname, '../src/styles/arcane.tokens.css'), 'utf8');

/** Pull `--name: #hex;` declarations out of the overlay. */
function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of CSS.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

describe('Arcane Surface tokens', () => {
  it('defines the ground, surface, and accent set', () => {
    const t = tokens();
    expect(t['--arc-bg']).toBe('#030508');
    expect(t['--arc-surface']).toBe('#0a0d14');
    expect(t['--arc-surface-2']).toBe('#121620');
    expect(t['--arc-text']).toBe('#f2f6ff');
    expect(t['--arc-text-muted']).toBe('#9fb0c8');
    expect(t['--arc-primary']).toBe('#00e5ff');
    expect(t['--arc-arcane']).toBe('#9d4edd');
    expect(t['--arc-gold']).toBe('#ffd700');
    expect(t['--arc-danger']).toBe('#ff2a2a');
  });

  it('clears the 4.5:1 body-text floor for every token allowed as text', () => {
    const t = tokens();
    // --arc-arcane is deliberately absent: it fails body contrast and is
    // restricted to non-text use. The next test pins that restriction.
    for (const key of [
      '--arc-text',
      '--arc-text-muted',
      '--arc-primary',
      '--arc-gold',
      '--arc-danger',
    ]) {
      for (const groundKey of ['--arc-bg', '--arc-surface', '--arc-surface-2']) {
        const ratio = contrastRatio(t[key], t[groundKey]);
        expect(ratio, `${key} on ${groundKey}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the non-text accent above the 3:1 floor on every ground', () => {
    const t = tokens();
    for (const groundKey of ['--arc-bg', '--arc-surface', '--arc-surface-2']) {
      const ratio = contrastRatio(t['--arc-arcane'], t[groundKey]);
      expect(ratio, `--arc-arcane on ${groundKey}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('documents in the file itself that the arcane accent is not for body text', () => {
    // The rule has to survive someone reading only the CSS.
    expect(CSS).toMatch(/not for body text|never body text|non-text only/i);
  });

  // Semantic state colour is off limits here. emberwood.tokens.css sets the
  // precedent and states why: hostile, friendly, debuff school, team flag, and
  // resource bar colours stay classic so colourblind reads and state
  // recognition are unchanged. A web surface has no business redefining them.
  describe('semantic state colours stay out', () => {
    const FORBIDDEN = [
      'hostile',
      'friendly',
      'neutral',
      'debuff',
      'buff',
      'team',
      'faction',
      '--hp',
      '--mana',
      '--rage',
      '--energy',
      'health',
      'resource',
    ];

    it('defines no semantic state token', () => {
      const declared = [...CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
      const offenders = declared.filter((name) => FORBIDDEN.some((bad) => name.includes(bad)));
      expect(offenders, `state tokens must not be redefined here: ${offenders.join(', ')}`).toEqual(
        [],
      );
    });

    it('every token it does define is namespaced --arc-', () => {
      const declared = [...CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
      expect(declared.length).toBeGreaterThan(0);
      for (const name of declared) {
        expect(name, `${name} escapes the --arc- namespace`).toMatch(/^--arc-/);
      }
    });
  });
});
