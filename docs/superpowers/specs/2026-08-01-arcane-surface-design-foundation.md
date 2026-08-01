# Arcane Surface: design foundation for the web surfaces

**Date:** 2026-08-01

**Status:** Approved direction, ready for implementation planning

**Program:** track 0 of 4 (see Section 9)

## 1. Purpose

The user asked for a player dashboard, an extended backoffice, more email
notifications, and for all of it to look like a private reference project
(`SaaS-Pretty-Projects/velyqarn`). This spec covers only the design foundation that
the other three tracks build on.

It comes first for one reason: building the dashboard and restyling it afterwards
does the work twice. The visual language has to be settled before any new surface is
authored against it.

## 2. What the reference actually contributes

`velyqarn` is React 18, Tailwind, and Firebase. None of that can come into this repo:
the root `CLAUDE.md` mandates a tiny dependency set, with Svelte as the single
sanctioned exception scoped to `src/admin/`, and the game client is deliberately
framework-free. So the reference contributes a PALETTE AND A FEEL, not code:

| Token | Value | Role in the reference |
|---|---|---|
| background | `#030508` | near-black page ground |
| surface | `#0a0d14` | card ground |
| surface2 | `#121620` | raised card ground |
| primary | `#00e5ff` | cyan interactive accent |
| arcane | `#9d4edd` | purple secondary accent |
| gold | `#ffd700` | premium / achievement |
| danger | `#ff2a2a` | destructive |

Plus glassmorphism
(`linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))`), glow
shadows (`0 0 40px -10px` at 40 percent alpha), and slow float and pulse animations.

**Typography is taken from this repo, not the reference.** The reference pairs Cinzel
with Inter. DESIGN.md section 5.1 commits the interface to the Alegreya superfamily
and names Cinzel as `--font-brand`, reserved for "the pre-game shell, logo lockups,
and static pages". A dashboard is exactly that surface, so Cinzel for display type is
already the prescribed choice rather than an import from the reference.

Inter is NOT adopted. It duplicates the role `--font-ui` (Alegreya Sans) already
fills, it is not in the sanctioned stack, and adding it would put the new surfaces in
conflict with the adopted design language for no gain. Both Cinzel
(`public/fonts/cinzel-400-700-latin*.woff2`) and Alegreya Sans are already vendored
and self-hosted, so this track adds ZERO font payload.

## 3. Key finding: the seam already exists

This does NOT need new architecture. `src/styles/emberwood.tokens.css` is already
exactly this pattern: a token overlay under `@layer tokens`, scoped to
`:root[data-visual-theme="emberwood"]`, remapping the structural palette while the
runtime theme system (`src/ui/theme.ts`) writes live accents on top.

Track 0 is therefore a THIRD overlay following that precedent, not a new system.

## 4. Two hard constraints, both non-negotiable

### 4.1 Semantic state colours must not be remapped

`emberwood.tokens.css` states the rule and this spec inherits it verbatim: semantic
state colours (hostile, friendly, debuff schools, team flags, resource bars) stay at
their classic values, so colourblind reads and state recognition are unchanged. Only
the structural frame palette is re-tuned.

This creates a direct collision with the reference palette that the implementation
MUST resolve rather than ignore:

- Reference `primary #00e5ff` (cyan) sits close in hue to the game's semantic
  `mana #2d8cf0`. Using cyan as a general interactive accent risks reading as a mana
  bar, or worse, making a real mana bar read as chrome.
- Reference `danger #ff2a2a` sits close to semantic `rage #c0392b`.

Resolution adopted: the reference accents are permitted ONLY on structural chrome
(borders, focus rings, headings, links, card edges) and are FORBIDDEN on any surface
that also renders a resource bar or a state colour. The dashboard has no resource
bars, so this is comfortable there; the constraint matters when track 3 restyles the
admin SPA and any future HUD work.

### 4.2 Contrast floors are enforced, not advisory

`src/ui/theme.ts` exports `contrastRatio` and `tests/theme.test.ts` cross-checks it
against an independent WCAG 2.1 implementation. DESIGN.md section 4.2 records the
classic preset clearing the floors with margin (text about 14.7:1, muted 7.9:1,
accent 7.3:1).

Every new token pair in this overlay must be measured, not eyeballed. Section 7 makes
that a test rather than a review note. A near-black ground plus a saturated cyan is
easy to get wrong: `#00e5ff` on `#030508` is high contrast, but `#00e5ff` used as
text on `#121620` needs checking, and gold `#ffd700` on `#0a0d14` needs checking.

## 5. Scope

### In scope
- A new token overlay, `src/styles/arcane.tokens.css`, under `@layer tokens`, scoped
  to a data attribute, following the `emberwood.tokens.css` precedent exactly.
- Registration in the `src/styles/index.css` barrel in the declared layer order.
- Typography wired to the EXISTING tokens: `--font-brand` (Cinzel) for display and
  `--font-ui` (Alegreya Sans) for body. Both are already vendored and self-hosted, so
  no new font files, no new `@font-face`, and no CREDITS.md row.
- A small set of reusable surface primitives (card, glass panel, glow edge) as CSS
  classes under `@layer components`, so tracks 1 and 3 compose rather than re-author.
- A contrast test covering every foreground and background pair the overlay defines.

### Out of scope
- Any new `VisualThemeId`. The dashboard is a separate HTML entry that renders no 3D,
  so it needs a CSS overlay only. Adding a third id to
  `visual_theme_core.ts` would force a decision in every render policy
  (`lightingForTheme`, `terrainPaletteForTheme`, `materialOverridesForTheme`,
  `moteProfileForTheme`) for a theme that never draws a world. Explicitly rejected.
- Restyling the in-game HUD. The game keeps its gold and parchment identity.
- Tailwind, React, or any new dependency.
- The dashboard itself, the email events, and the backoffice work (tracks 1 to 3).

## 6. Where it applies

The overlay is opt-in per surface, by data attribute on the document element:

- `dashboard.html` (track 1): opted in from the start.
- `admin.html` (track 3): opted in when that track lands, not before.
- `index.html` (the game): NEVER opted in. The game's identity is unchanged.

Opting in per entry rather than globally is what keeps this from becoming a
site-wide restyle nobody approved.

## 7. Verification

- A new `tests/arcane_tokens.test.ts` parses the overlay and asserts, for every
  foreground and background pair it defines, that `contrastRatio` clears 4.5:1 for
  body text and 3:1 for large text and non-text UI, using the module's own helper so
  the production rule and the test agree.
- A guard asserting the overlay defines NO semantic state token (no hostile,
  friendly, debuff, team, hp, mana, rage, or energy key), which is how constraint 4.1
  stops being a good intention and becomes enforced.
- `tests/css_corpus.test.ts` already guards the CSS union corpus and brace balance;
  it must stay green, which catches a dropped brace silently discarding later CSS.
- Visual check of the game client confirming it is untouched, since the overlay is
  opt-in and `index.html` never opts in.

## 8. Risks

**The reference palette may simply not suit this product.** velyqarn is a
cyan-and-purple crypto aesthetic; Endless Glory is gold, bronze, and parchment with a
deliberate classic-MMO signature that DESIGN.md calls a non-negotiable visual
signature. Putting a cyan dashboard next to a gold game may read as two products.

This spec does not resolve that tension, because it is a taste call for the user, not
an engineering one. It does contain it: the overlay is opt-in per entry, the game is
never opted in, and reverting is deleting one file and one import. If the two-product
feel is unwelcome once seen, the cheapest fix is retuning the overlay's accents
toward the existing gold, which is a values change in one file.

**Font payload: resolved, no risk.** An earlier draft of this spec proposed adopting
the reference's Inter. Checking DESIGN.md section 5.1 showed that is the wrong call:
the interface is committed to Alegreya, and Cinzel is already the sanctioned
`--font-brand` for exactly this class of surface. Both faces are already vendored
under `public/fonts/`, so this track ships no new bytes and adds no conflict with the
adopted design language.

## 9. The wider program

| # | Sub-project | Status |
|---|---|---|
| 0 | Arcane Surface design foundation | this spec |
| 1 | Player web dashboard (`dashboard.html`) | not started |
| 2 | Email notification events | not started |
| 3 | Backoffice extensions | not started, needs the user to say what is missing |

## 10. Approval record

Scope selected by the user on 2026-08-01 (all four tracks). The ordering, with the
design foundation first, was proposed and approved in the same exchange on the
grounds that building then restyling duplicates work.
