# Player Web Dashboard, part 1a: shell, auth, Profile, Collection, Leaderboard

**Date:** 2026-08-02

**Status:** Approved direction, ready for implementation planning

**Program:** track 1a of the dashboard/backoffice/email program (see Section 9)

## 1. Purpose

The user asked for a standalone player dashboard modeled on a reference project
(`SaaS-Pretty-Projects/velyqarn`). Track 0 shipped the visual foundation (the Arcane
Surface token overlay and primitives, opt-in, not wired to anything). This spec is
the first consumer: a new browser entry outside the 3D game client where a player
can log in, see their character profile, their deeds/achievements collection, and
the leaderboards, without loading the game at all.

Track 1 was split into 1a and 1b during brainstorming because it spans very
different kinds of work. 1a is presentation over data that already exists and
requires zero new server logic. 1b (balance, transactions, withdrawal, support)
needs real integration against an external economy service and the email sender,
and deliberately comes after 1a proves the shell and auth are solid.

## 2. Key findings that shape this spec

**Auth can reuse the game's existing session, but a standalone dashboard still
needs its own login form.** `src/net/online.ts`'s `Api` class caches `{token,
username}` under `Api.SESSION_KEY` in `localStorage`. Any same-origin page can
call `Api.prototype.restoreSession()` and read it, so a player who already has the
game open in another tab arrives at the dashboard already logged in. But someone
who opens `dashboard.html` directly, with no prior game session, has nothing to
restore. The user confirmed (Section 10) the dashboard should have its own login
form calling the SAME endpoints the game uses (`/api/login`, `/api/register`), not
a parallel auth system.

**Every page in scope reads an endpoint the game already calls.** No new server
route is needed for 1a:

| Page | Backing endpoint(s) | Already consumed by |
|---|---|---|
| Profile | `/api/me/characters`, `/api/characters/:id/sheet` | the in-game character sheet |
| Collection | the deeds/achievements system (`server/deeds*.ts`) | the in-game deeds board |
| Leaderboard | `/api/leaderboard`, `/api/arena/leaderboard` | the in-game high scores view |

This is why 1a is scoped the way it is: it is entirely a new PRESENTATION surface
over data and auth that already exist and are already exercised in production.

**The repo has a proven template for exactly this shape of entry.**
`src/guide/` is a standalone HTML entry (`guide.html` -> `src/guide/main.ts`),
vanilla TypeScript, its own style barrel (`src/guide/styles.css`, imported once),
and its own i18n usage through the shared `src/ui/i18n` machinery
(`ensureLocaleLoaded`, `getLanguage`, `t()`) rather than a bespoke catalog system.
The dashboard follows this template rather than inventing a new one.

**Svelte is not an option here.** The root `CLAUDE.md` sanctions Svelte only for
`src/admin/`, scoped there deliberately ("it never touches the game client
bundle"). Reusing it for the player dashboard would spread the one framework
exception into a second surface, which the repo's own conventions forbid. The
dashboard is vanilla TypeScript, same as the game, guide, and editor entries.

## 3. Scope

### In scope
- New entry: `dashboard.html` -> `src/dashboard/main.ts`, registered in
  `vite.config.ts`'s `rollupOptions.input` alongside the existing five entries.
- `src/dashboard/styles.css`: the entry's own style barrel, importing
  `../styles/arcane.tokens.css` and `../styles/arcane.components.css` from track 0,
  with the document root carrying `data-surface="arcane"`. This is the FIRST real
  consumer of the track 0 overlay.
- A login form (username/password, matching the game's existing validation rules)
  plus 2FA challenge handling, calling `/api/login` and `/api/register`. Session
  persists via the existing `Api.saveSession()` / `restoreSession()` /
  `clearSession()` methods, unchanged.
- A shell: nav between the three pages, a logged-out state, and a single auth-gate
  choke point every page routes through (mirroring `loadAccountPortal`'s pattern
  in `src/main.ts`: restore, revalidate server-side, render; on auth failure clear
  and show the login form).
- Three page-view modules: Profile, Collection, Leaderboard. Each is READ-ONLY
  for 1a: no mutation actions (renaming a character, etc.) are in scope.
- A new i18n catalog domain, `src/ui/i18n.catalog/dashboard.ts`, registered in
  `src/ui/i18n.catalog/index.ts` exactly as `guide.ts` is. English-only per the
  repo's contributor convention; other locales go `pending` until the maintainer
  fills them at release.
- Responsive layout from the start, per the user's explicit choice: the dashboard
  gets a real mobile layout in this track, not a follow-up. Every `.window`-style
  panel needs a deliberate mobile decision, same invariant `src/styles/CLAUDE.md`
  already enforces for the game HUD.

### Explicitly out of scope (this is 1a; 1b picks these up)
- Balance, Transactions, Withdrawal: need real integration with the external
  economy service through `server/credits_proxy.ts`. Deferred to 1b.
- Support: no ticketing backend exists today; the user chose a simple contact
  form through the existing email sender (`server/email/`) for 1b, not a new
  ticket subsystem.
- Any WRITE action from the dashboard (editing profile fields, claiming rewards,
  etc.). 1a is read-only by design; mutation actions are a later decision.
- A new `VisualThemeId` or any change to the 3D game client. The dashboard is a
  separate HTML entry; `index.html` is untouched.
- Real-time updates (websocket push, polling). Pages fetch on load and on
  explicit user refresh; a live feed is out of scope until there is a reason for
  one.

## 4. Architecture

**Entry and module shape**, following `src/guide/`:

```
dashboard.html                          new HTML entry
src/dashboard/
  main.ts                               boot: session restore, router, auth gate
  styles.css                            imports the two arcane.*.css files
  shell.ts                              nav, logged-out state, the auth choke point
  login_view.ts / login_painter.ts       pure core (form validation, 2FA state
                                         machine) + thin DOM painter, same
                                         pure-core-plus-painter recipe as
                                         src/ui/unit_portrait.ts
  profile_view.ts / profile_painter.ts   same pattern
  collection_view.ts / collection_painter.ts
  leaderboard_view.ts / leaderboard_painter.ts
```

Each `*_view.ts` is DOM-free and Node-tested directly, holding the pure decision
logic (what to show, given a data shape and auth state); each `*_painter.ts` is
the thin DOM half. This mirrors the established pattern in `src/ui/CLAUDE.md`
(`unit_portrait.ts` + `unit_portrait_painter.ts`) rather than inventing a new
convention for this entry.

**Auth flow:**

```
boot -> Api.restoreSession()
  no session  -> render login form
  session     -> revalidate (Api.getAccount())
                   success -> render shell + requested page
                   auth error -> Api.clearSession() -> render login form
                   transient error -> render shell with cached identity,
                                      matching loadAccountPortal's existing
                                      fallback in src/main.ts
```

No new auth state machine: this is the exact shape `loadAccountPortal` already
implements in the game client, reused rather than redesigned.

**Data flow per page:** on navigating to a page, fetch its endpoint(s) through the
shared `Api` instance, render, and expose a manual retry affordance on failure.
No page blocks another; a failed Leaderboard fetch does not affect Profile.

## 5. Error handling

- **Auth errors** (expired/invalid token) anywhere in the dashboard: clear the
  session and return to the login form. Never show a broken page pretending to
  be logged in.
- **Network/transient errors** on a page fetch: show an inline retry state
  scoped to that page. The shell and nav stay usable.
- **Login failures:** surface the server's actual error (bad credentials, rate
  limited, 2FA required) using the existing error-code plumbing
  (`src/ui/api_error_i18n.ts`'s `userFacingApiError`), not a re-derived message.

## 6. i18n

Every player-visible string in the dashboard is a `t()` key, per the root
`CLAUDE.md` invariant that this is classified by render sink, not surface: labels,
buttons, form validation and error text, and the page titles all qualify. The
new `dashboard.ts` catalog domain is contributed English-only; the maintainer
fills every locale at release, identical to how every other catalog domain
works today.

## 7. Testing

- Each `*_view.ts` pure core gets a direct Vitest, no DOM, covering its decision
  logic (what renders given a data shape and auth state), added to
  `UI_PURE_CORES` in `tests/architecture.test.ts` per the existing convention for
  new pure cores.
- The shell's auth-gate logic gets tests against a faked `Api` (session present,
  absent, revalidate succeeds, revalidate fails with auth error, revalidate
  fails transiently), since it is the one piece of this track with real
  branching.
- A `tests/dashboard_entry_wiring.test.ts` mirroring the existing
  `per_entry_css_wiring.test.ts` pattern: confirms `dashboard.html` loads
  `src/dashboard/main.ts`, which imports `src/dashboard/styles.css`, which
  imports both track-0 arcane files.
- `tests/css_corpus.test.ts` and the mobile-coverage test
  (`tests/mobile_window_coverage.test.ts`) must both stay green, or explicitly
  gain the dashboard's new panels as deliberate entries.

## 8. Risks

**Scope creep from "just add one more page."** 1a is deliberately three
read-only pages. Any page needing a new server route or a write action belongs
in a later track, not folded into 1a because it seems small.

**The login form duplicates validation logic that already lives in
`src/main.ts`.** The game's landing page already has username/password rules,
2FA handling, and error copy. The implementation plan should extract shared
validation into something both entries import rather than hand-copying it, if
that extraction is small; if it is not small, duplicating once with a comment
pointing at the original is acceptable rather than a large unrelated refactor of
the game's landing page. This is a judgment call for the plan, not resolved here.

## 9. The wider program

| # | Sub-project | Status |
|---|---|---|
| 0 | Arcane Surface design foundation | shipped |
| 1a | Dashboard shell, auth, Profile, Collection, Leaderboard | this spec |
| 1b | Balance, Transactions, Withdrawal, Support | not started |
| 2 | Email notification events | not started |
| 3 | Backoffice extensions | not started, needs the user to say what is missing |

## 10. Approval record

Scope, the auth model (own login form, not a redirect), and full responsiveness
from day one were selected by the user on 2026-08-02. The 1a/1b split was
proposed during brainstorming on the grounds that 1a ships something real and
lookable-at with zero new backend work, while 1b's economy-proxy integration is
real work best done against a proven foundation; the user approved the split.
