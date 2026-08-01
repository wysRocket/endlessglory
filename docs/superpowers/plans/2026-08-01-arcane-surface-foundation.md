# Arcane Surface Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the token overlay and surface primitives that the player dashboard, the backoffice restyle, and any future web surface build against.

**Architecture:** Two standalone stylesheets following the `emberwood.tokens.css` precedent: a token overlay under `@layer tokens` and primitives under `@layer components`, both scoped to a data attribute. They are imported by CONSUMING entry barrels, never by the game barrel. Two Vitest guards enforce the accessibility rules the spec makes non-negotiable.

**Tech Stack:** Plain CSS with `@layer` and custom properties. Vitest for the guards. No new dependencies, no new fonts.

**Spec:** [`docs/superpowers/specs/2026-08-01-arcane-surface-design-foundation.md`](../specs/2026-08-01-arcane-surface-design-foundation.md)

---

## Working agreement

**Work directly on `main`.** No worktree, no branch, matching this session's convention. Commit after each task.

**No em dashes, en dashes, or emojis anywhere**, including commit messages. A pre-push hook blocks them.

**The changed-files biome gate lints the WHOLE file** once any line changes. Keep its auto-fixes rather than reverting them as unrelated.

## Critical placement rule (read before task 1)

Each entry has its OWN style barrel:

| Entry | Barrel |
|---|---|
| game (`index.html`) | `src/main.ts` imports `src/styles/index.css` |
| guide (`guide.html`) | `src/guide/main.ts` imports `src/guide/styles.css` |
| admin (`admin.html`) | `src/admin/main.ts` imports `src/admin/admin.css` |

**The new files MUST NOT be added to `src/styles/index.css`.** That barrel is the GAME bundle. The game never opts into this look (spec section 6), so importing there would ship dead CSS to every player and couple the dashboard's styling to the game's payload.

Track 0 therefore adds the files and their guards but wires NO consumer. The first consumer is `dashboard.html` in track 1. This means **track 0 ships no visible change**, which is intended: it is a foundation, and its correctness is carried by the two guards plus a throwaway preview used during implementation.

## The values (single source of truth)

Ground and surfaces, from the reference:

| Token | Value |
|---|---|
| `--arc-bg` | `#030508` |
| `--arc-surface` | `#0a0d14` |
| `--arc-surface-2` | `#121620` |

Accents and text, with MEASURED contrast against `--arc-surface` (`#0a0d14`), computed with the WCAG 2.1 formula:

| Token | Value | Ratio | Body text (4.5) | Non-text / large (3.0) |
|---|---|---|---|---|
| `--arc-text` | `#f2f6ff` | 17.95 | PASS | PASS |
| `--arc-text-muted` | `#9fb0c8` | 8.81 | PASS | PASS |
| `--arc-primary` | `#00e5ff` | 12.63 | PASS | PASS |
| `--arc-gold` | `#ffd700` | 13.86 | PASS | PASS |
| `--arc-danger` | `#ff2a2a` | 5.20 | PASS | PASS |
| `--arc-arcane` | `#9d4edd` | 4.23 | **FAIL** | PASS |

**`--arc-arcane` is the one that fails.** At 4.23 on `--arc-surface` and 3.93 on
`--arc-surface-2` it clears only the 3:1 non-text floor. It is therefore restricted to
borders, glows, gradient stops, and large display type, and is FORBIDDEN as body text.
Task 2 enforces this with a test rather than a comment, because a comment would be
ignored the first time someone wants a purple label.

## File structure

| File | Responsibility | Action |
|---|---|---|
| `src/styles/arcane.tokens.css` | Token overlay under `@layer tokens` | Create |
| `src/styles/arcane.components.css` | Card, glass panel, glow edge under `@layer components` | Create |
| `tests/arcane_tokens.test.ts` | Contrast floors and the no-state-token guard | Create |

---

### Task 1: The token overlay

**Files:**
- Create: `src/styles/arcane.tokens.css`
- Test: `tests/arcane_tokens.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/arcane_tokens.test.ts`:

```ts
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
    for (const key of ['--arc-text', '--arc-text-muted', '--arc-primary', '--arc-gold', '--arc-danger']) {
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
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/arcane_tokens.test.ts`

Expected: FAIL, `ENOENT ... src/styles/arcane.tokens.css`.

- [ ] **Step 3: Create the overlay**

Create `src/styles/arcane.tokens.css`:

```css
/* arcane.tokens.css: the Arcane Surface palette for the web surfaces (player
   dashboard, backoffice). Loaded under @layer tokens, scoped to
   [data-surface="arcane"] so it only applies where an entry opts in.

   NOT imported by src/styles/index.css. That barrel is the game bundle and the
   game keeps its gold and parchment identity (design spec section 6); importing
   there would ship dead CSS to every player.

   Palette, from the reference project:
     bg        #030508  page ground
     surface   #0a0d14  card ground
     surface2  #121620  raised card ground
     primary   #00e5ff  cyan interactive accent
     arcane    #9d4edd  purple secondary accent
     gold      #ffd700  premium / achievement
     danger    #ff2a2a  destructive

   ACCESSIBILITY, both rules enforced by tests/arcane_tokens.test.ts:

   1. --arc-arcane is NOT FOR BODY TEXT. Measured against the surfaces it scores
      4.23 and 3.93, under the 4.5:1 body floor and over the 3:1 non-text floor.
      Use it for borders, glows, gradient stops, and large display type only.

   2. This file defines NO semantic state colour. Hostile, friendly, debuff
      school, team flag, and resource bar colours stay at their classic values so
      colourblind reads and state recognition are unchanged, exactly as
      emberwood.tokens.css does. The reference palette collides with two of them
      (its cyan sits near the semantic mana blue, its red near rage), which is
      why the accents here are confined to structural chrome. */

@layer tokens {
  :root[data-surface='arcane'] {
    /* Ground and surfaces */
    --arc-bg: #030508;
    --arc-surface: #0a0d14;
    --arc-surface-2: #121620;

    /* Text */
    --arc-text: #f2f6ff;
    --arc-text-muted: #9fb0c8;

    /* Accents. See the accessibility note above before using --arc-arcane. */
    --arc-primary: #00e5ff;
    --arc-arcane: #9d4edd;
    --arc-gold: #ffd700;
    --arc-danger: #ff2a2a;

    /* Derived chrome. Alpha variants are for edges and glows, never for text. */
    --arc-border: rgba(255, 255, 255, 0.08);
    --arc-border-strong: rgba(0, 229, 255, 0.35);
    --arc-glass: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.05) 0%,
      rgba(255, 255, 255, 0.01) 100%
    );
    --arc-glow-primary: 0 0 40px -10px rgba(0, 229, 255, 0.4);
    --arc-glow-arcane: 0 0 40px -10px rgba(157, 78, 221, 0.4);

    /* Typography: the repo's own sanctioned faces, already vendored and
       self-hosted. The reference project's Inter is deliberately NOT adopted; it
       duplicates the role Alegreya Sans already fills.

       The fallback chains are load-bearing, not defensive noise:

       - --font-brand does NOT exist yet. DESIGN.md section 5.1 introduces it as
         the eventual home for Cinzel, after which --font-display flips to
         Alegreya. That migration has not happened, so today Cinzel lives in
         --font-display. Naming both, in that order, means this surface keeps
         Cinzel before AND after the migration instead of silently turning into
         Alegreya the day someone completes it.
       - The literal tail covers a consuming entry whose barrel does not import
         tokens.css. The guide entry, for instance, defines its own font stack and
         never loads it. Without the tail this overlay would fall back to the
         browser default there. */
    --arc-font-display: var(--font-brand, var(--font-display, 'Cinzel', Georgia, serif));
    --arc-font-body: var(--font-ui, 'Alegreya Sans', system-ui, sans-serif);
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/arcane_tokens.test.ts`

Expected: PASS, 4 tests.

If the body-text floor test fails on a token you did not expect, do NOT lower the
threshold. Change the colour and update the table in this plan.

- [ ] **Step 5: Confirm the game bundle is untouched**

Run: `grep -n "arcane" src/styles/index.css || echo "correctly absent"`

Expected: `correctly absent`. If it appears there, remove it: see the placement rule.

- [ ] **Step 6: Commit**

```bash
npx @biomejs/biome check --write tests/arcane_tokens.test.ts
git add src/styles/arcane.tokens.css tests/arcane_tokens.test.ts
git commit -m "feat(styles): add the Arcane Surface token overlay

The palette for the coming player dashboard and backoffice restyle, following
the emberwood.tokens.css pattern: a token overlay under @layer tokens, scoped to
a data attribute so it applies only where an entry opts in. Deliberately not
imported by the game barrel, which would ship dead CSS to every player.

Contrast is measured rather than eyeballed. The purple accent scores 4.23 and
3.93 against the two card grounds, so it clears the 3:1 non-text floor and fails
the 4.5:1 body floor; it is restricted to borders, glows, and large display type
and the test pins that. Typography reuses the already-vendored Cinzel and
Alegreya Sans, so no new font payload."
```

---

### Task 2: The no-state-token guard

The spec makes this the difference between an intention and a rule. Without it,
the first person who wants a purple status pill quietly remaps a resource colour
and breaks a colourblind player's read.

**Files:**
- Modify: `tests/arcane_tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe` in `tests/arcane_tokens.test.ts`:

```ts
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
      const offenders = declared.filter((name) =>
        FORBIDDEN.some((bad) => name.includes(bad)),
      );
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
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/arcane_tokens.test.ts`

Expected: PASS, 6 tests. The overlay from task 1 already satisfies both rules; these
tests exist to keep it that way.

- [ ] **Step 3: Prove the guard bites**

A guard that cannot fail is worthless. Temporarily add `--hp: #25c84a;` inside the
overlay's `:root` block, re-run, and CONFIRM the first test fails naming `--hp`. Then
REMOVE the temporary line and confirm green again. Report both results.

- [ ] **Step 4: Commit**

```bash
git add tests/arcane_tokens.test.ts
git commit -m "test(styles): forbid semantic state colours in the Arcane overlay

Hostile, friendly, debuff school, team flag, and resource colours stay at their
classic values so colourblind reads and state recognition are unchanged. The
emberwood overlay states that rule in a comment; this makes it enforceable, and
also pins every token to the --arc- namespace so the overlay cannot reach out
and redefine something it does not own.

Verified the guard bites by adding --hp temporarily and watching it fail."
```

---

### Task 3: Surface primitives

Three reusable classes so tracks 1 and 3 compose rather than re-authoring a card
each time.

**Files:**
- Create: `src/styles/arcane.components.css`

- [ ] **Step 1: Create the file**

```css
/* arcane.components.css: reusable surface primitives for the Arcane Surface
   entries. Loaded under @layer components, scoped to [data-surface="arcane"].

   Consumers compose these rather than re-authoring a card. Same placement rule
   as arcane.tokens.css: NOT imported by src/styles/index.css (the game bundle).

   Every colour here comes from a --arc- token, never a literal hex, so the
   contrast guarantees the token tests enforce actually hold at the point of use. */

@layer components {
  :root[data-surface='arcane'] .arc-card {
    background: var(--arc-surface);
    border: 1px solid var(--arc-border);
    border-radius: 12px;
    padding: 20px;
    color: var(--arc-text);
    font-family: var(--arc-font-body);
  }

  :root[data-surface='arcane'] .arc-card--raised {
    background: var(--arc-surface-2);
  }

  /* Glass panel: the reference's signature treatment. The gradient is an
     overlay on the card ground, so text contrast is still governed by
     --arc-surface and stays inside the measured floors. */
  :root[data-surface='arcane'] .arc-glass {
    background-image: var(--arc-glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--arc-border);
    border-radius: 12px;
  }

  :root[data-surface='arcane'] .arc-glow {
    box-shadow: var(--arc-glow-primary);
  }

  :root[data-surface='arcane'] .arc-glow--arcane {
    box-shadow: var(--arc-glow-arcane);
  }

  :root[data-surface='arcane'] .arc-title {
    font-family: var(--arc-font-display);
    color: var(--arc-text);
    letter-spacing: 0.02em;
  }

  /* Large display type is the ONLY text role the purple accent may take, and
     only at this size: it fails the body-text contrast floor. See the
     accessibility note in arcane.tokens.css. */
  :root[data-surface='arcane'] .arc-title--arcane {
    color: var(--arc-arcane);
    font-size: 1.75rem;
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    :root[data-surface='arcane'] .arc-glow,
    :root[data-surface='arcane'] .arc-glow--arcane {
      transition: none;
    }
  }
}
```

- [ ] **Step 2: Verify it uses no literal colours**

Run:

```bash
grep -nE "#[0-9a-fA-F]{3,8}" src/styles/arcane.components.css || echo "no literal hex, correct"
```

Expected: `no literal hex, correct`. Every colour must come through a token, or the
contrast guarantees do not hold where it is actually used.

- [ ] **Step 3: Confirm the CSS corpus guard stays green**

Run: `npx vitest run tests/css_corpus.test.ts`

Expected: PASS. This catches a dropped brace, which would silently discard every rule
after it.

- [ ] **Step 4: Commit**

```bash
git add src/styles/arcane.components.css
git commit -m "feat(styles): add Arcane Surface primitives

Card, glass panel, glow edge, and title roles so the dashboard and the backoffice
restyle compose instead of re-authoring a card each. Every colour resolves through
an --arc- token rather than a literal, so the measured contrast floors hold at the
point of use.

The purple accent appears in exactly one text role, large display type, which is
the only place it clears its floor."
```

---

### Task 4: Preview and gate

**Files:** none committed

- [ ] **Step 1: Eyeball the primitives**

Track 0 wires no consumer, so nothing in the app renders this yet. Build a THROWAWAY
harness to look at it. Write a scratch HTML file under the session scratchpad (NOT in
the repo), give its root `data-surface="arcane"`, import the two stylesheets, and drop
in one of each primitive plus a paragraph of body text and a muted caption.

Confirm by eye:
1. Cards read as distinct layers against the page ground.
2. Body text is comfortable, not glaring, on the card.
3. The glow reads as a soft edge, not a halo that swamps the content.
4. The purple title is legible at display size.

Delete the harness afterwards. Do NOT commit it.

If you cannot render it in this environment, SAY SO in your report rather than
implying you looked. The automated guards still hold; the visual check simply moves
to track 1, where the dashboard gives it a real consumer.

- [ ] **Step 2: Copy-rule scan**

```bash
git diff origin/main...HEAD | perl -CSD -ne 'next unless /^\+/ && !/^\+\+\+/; my $c=substr($_,1); print "VIOLATION: $c" if $c =~ /[\x{2013}\x{2014}\x{2015}\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]/'
```

Expected: no output.

- [ ] **Step 3: Full gate**

```bash
npm run gate > /tmp/gate-arcane.log 2>&1; echo "GATE_EXIT_CODE=$?" >> /tmp/gate-arcane.log
tail -3 /tmp/gate-arcane.log
```

Expected: `GATE_EXIT_CODE=0`.

Never pipe the gate through `tee` or `tail` inline: that reports the pipe's exit code,
not the gate's, and has masked a real failure in this repo before.

If vitest fails, check whether the failures are `Test timed out` with no assertion
failures. That is the documented full-suite contention flakiness, not a regression;
confirm by re-running the named files in isolation. Only assertion failures indicate a
real problem.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 5 in scope: token overlay | Task 1 |
| 5 in scope: barrel registration | Deliberately NOT done, see the placement rule |
| 5 in scope: typography from existing tokens | Task 1 step 3 (`--arc-font-*`) |
| 5 in scope: surface primitives | Task 3 |
| 5 in scope: contrast test | Task 1 steps 1 and 4 |
| 4.1 no semantic state colours | Task 2 |
| 4.2 contrast floors enforced | Task 1, with measured values in the plan |
| 7 verification | Tasks 1 to 4 |

**One deliberate deviation from the spec.** Spec section 5 lists "registration in the
`src/styles/index.css` barrel". That is wrong and this plan does not do it: `index.css`
is the game barrel, and spec section 6 says the game never opts in. Registration
belongs to the consuming entry in track 1. Flagged here rather than silently followed,
and the spec should be corrected when track 1 lands.

**Placeholder scan:** none. Every code step carries complete file content.

**Type consistency:** the token names in the task 1 CSS, the task 1 test, and the plan's
value table are the same nine `--arc-*` names. Task 3 consumes only tokens task 1
defines.

**Known risk:** track 0 ships nothing visible, so a mistake here surfaces only in track
1. That is why both guards are real tests and why task 2 step 3 requires proving the
guard bites rather than trusting a green run.

**Correction made while writing this plan.** An earlier draft wired the display face to
`var(--font-brand)`. That token DOES NOT EXIST: DESIGN.md section 5.1 introduces it as a
future migration that has not happened, and Cinzel currently lives in `--font-display`.
The draft would have silently fallen back to the browser default. The shipped chain is
`var(--font-brand, var(--font-display, 'Cinzel', Georgia, serif))`, which is correct
today, survives that migration whenever it lands, and still works for a consuming entry
whose barrel never imports `tokens.css` at all (the guide entry is exactly that case).
Worth stating because "reference a token the design doc mentions" is a natural mistake
to repeat.
