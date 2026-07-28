# Firestore Scope: Design Spec

**Date:** 2026-07-27

**Status:** Written to unblock implementation; the boundary in Section 3 is the load-bearing part

## 1. Why this document exists

The Firebase Auth spec (`2026-07-27` sibling: `2026-07-22-firebase-auth-design.md`)
deliberately excluded Firestore, deferring it to "its own spec once this phase has
shipped and proven itself". That deferral was overridden: Firestore is being added in
the same pass as Auth. This spec is that deferred document, written before the code so
the scope question is settled deliberately rather than by whatever the first commit
happened to do.

It exists because "add Firestore" is not a self-describing request. A second live
datastore next to Postgres raises three questions the Auth spec never answered: which
data moves, how it stays consistent with the authoritative simulation, and what happens
when the two disagree.

## 2. The constraint that decides most of it

The root `CLAUDE.md` states an invariant that is not negotiable here:

> **The server is authoritative.** Clients stream movement intent + commands at 20 Hz;
> the server runs the one shared `Sim` and returns interest-scoped snapshots + per-player
> events. All combat, loot, quest credit, and economy resolve server-side. The client is
> a renderer; it never decides outcomes.

Firestore's value proposition is a client writing directly to a cloud database. That is
exactly what this architecture forbids for anything a player can gain from. A client that
can write its own gold, inventory, quest credit, XP, or position has defeated the server
authority model, and no Firestore security rule can restore it: rules can constrain
*shape*, not *legitimacy*. A rule cannot know whether a player actually killed the mob.

The deterministic sim compounds this. `src/sim/` is a fixed 20 Hz tick where identical
seed plus identical inputs must produce identical state across all three hosts (browser,
server, headless RL env). A second writable store that any host reads mid-tick would make
the sim's output depend on network state, breaking the determinism invariant that
`tests/parity/` exists to protect.

**Therefore: no game state in Firestore. Not as a cache, not as a mirror, not "just for
reads".** Postgres remains the sole source of truth for accounts, sessions, and all game
data, exactly as the Auth spec says.

## 3. What Firestore IS for here

Firestore holds **client-owned, non-authoritative preference data**: settings that belong
to the human rather than the character, that no player can gain an advantage by editing,
and that the sim never reads.

In scope:

- **UI and input preferences**: keybinds, graphics tier preference, HUD layout/scale,
  chat tab configuration, minimap zoom, audio volumes.
- **Client-side cosmetic toggles** that are already player-choosable and gameplay-neutral
  (per `CLAUDE.md`: "Graphics and performance settings are gameplay-neutral").

Explicitly out of scope, and enforced by the boundary test in Section 5:

- Anything in `accounts`, `auth_tokens`, or any table `server/db.ts` owns.
- Any character or world state: inventory, gold, XP, level, position, quests, talents,
  deeds, bank, market.
- Anything `src/sim/` reads or writes, ever.

The honest framing: this is **cross-device settings sync**, not a database migration. It
is worth doing because settings are today per-browser and lost on device change, and it is
safe to do because a player editing their own keybinds in the Firestore console has
achieved nothing.

## 4. Consistency model

There is none to design, because the two stores share no data. Postgres owns game state;
Firestore owns preferences; the sets are disjoint by construction and the boundary test
keeps them that way. Divergence between them is not a failure mode that can occur.

Failure behavior is therefore simple and local:

- Firestore unreachable: the client falls back to `localStorage`, which is where these
  settings live today. Nothing blocks login and nothing blocks play.
- Write conflict between two devices: last write wins, per document, per user. These are
  preferences; there is no correctness claim to preserve.

## 5. Security model

- Documents are keyed by Firebase UID: `users/{uid}/prefs/{doc}`.
- Rules permit read/write only where `request.auth.uid == uid`. No cross-user access, no
  unauthenticated access.
- The server does not read Firestore. Nothing on the authoritative path depends on it,
  so a compromised or unavailable Firestore cannot influence game outcomes.
- A test (`tests/firestore_boundary.test.ts`) asserts the Section 3 boundary in code: the
  set of keys the Firestore client is allowed to sync is a closed allowlist, and no
  identifier from the game-state vocabulary appears in it. This is the guard that stops
  scope creep from turning settings sync into a second source of truth later.

## 6. Relationship to Firebase Auth

Firestore depends on Auth and not the reverse: documents are keyed by the Firebase UID
that `server/firebase_auth.ts` already resolves. A player who signs in through the legacy
password path still gets a shadow Firebase identity (Auth plan, Task 5), so preference
sync works for them too, without changing the login UX.
