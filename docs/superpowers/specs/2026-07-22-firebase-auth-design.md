# Firebase Auth Migration: Design Spec

**Date:** 2026-07-22

**Status:** Approved direction, ready for implementation planning

## 1. Purpose

Move account sign-in from this repo's in-house password + OAuth stack onto Firebase
Auth, while keeping Postgres as the sole source of truth for every account and every
piece of game data. This is Phase 1 of a larger, explicitly deferred initiative:
broader persistence work (Firestore for game data, beyond accounts) is intentionally
out of scope here and will get its own spec once this phase has shipped and proven
itself.

## 2. Current state (what exists today)

- `server/auth.ts`: scrypt password hashing (`SCRYPT_N=16384`, `r=8`, `p=1`) plus
  verification, used by the email/password path.
- `server/auth_routes.ts`: the `RouteDef` module for `/api/register`, `/api/login`,
  and related credential routes, registered in `server/http/registry.ts`.
- `server/discord_oauth.ts` + `server/discord_db.ts`: Discord OAuth login/link flow.
  `discord_links` table: `account_id` (PK) to `discord_user_id` (UNIQUE), the durable
  1:1 identity mirror.
- `server/apple_auth.ts` + `server/apple_auth_db.ts`: Apple Sign In flow.
  `apple_auth_links` table: `account_id` (PK) to `apple_subject` (UNIQUE), same shape.
- `server/github.ts` + `server/github_oauth.ts` + `server/github_db.ts`: **not a
  sign-in method.** Per `github.ts`'s own header comment, this is "the GitHub OAuth
  link shell for the developer badge... linking is the only mode (the player is
  already authenticated when they link)... no first-time-login chooser, no account
  provisioning." It links an already-logged-in account to a GitHub identity purely to
  compute developer-badge tier from merged-PR history. There is no way to create or
  log into an account via GitHub today, so it is not part of this migration's
  provider set at all, and is untouched by this spec.
- `accounts` table (`server/db.ts`): `id`, `username`, `password_hash`, `email`,
  `email_verified_at`, `password_set`, plus moderation/admin/TOTP columns. No
  `firebase_uid` yet.
- `auth_tokens` table: the session mechanism, a bearer token keyed to `account_id`,
  with `scope` (`full`/`read`) and an optional `label`. This is what
  `server/ws_auth.ts` and every authenticated REST route actually check. It does not
  change in this phase.
- `server/email/`: an existing transactional email system (`sender.ts`, `ses_sender.ts`,
  `tokens.ts`, `service.ts`, `events.ts`), available if a migration communication is
  ever needed, though the design below does not require one.
- `server/oauth.ts` + `server/oauth_db.ts` (`oauth_clients`/`oauth_codes`/
  `oauth_device_codes`): a **different, unrelated** system, this repo acting as an
  OAuth *server* for third-party companion apps. Not touched by this spec.

There is currently no Firebase code anywhere in the tree. A single unused
`"firebase": "^12.16.0"` line exists in `package.json` inside an old, unapplied stash
on `main` (`stash@{2}` as of this writing), a prior, incomplete start at this same
work, with no accompanying integration code.

## 3. Scope decisions (settled during brainstorming)

- **Firebase Auth only, not Firestore.** Postgres stays authoritative for accounts,
  sessions, and all game data. No table listed above is replaced or migrated to
  Firestore in this phase.
- **Real accounts exist and must keep working.** No account may be locked out by this
  change; every existing sign-in path needs a migration story, not just new signups.
- **Provider set going forward:** email/password, Google (new), Discord, Apple. These
  are the full set of today's real sign-in methods plus Google. GitHub was never a
  sign-in method (see Section 2) and needs no decision here: there is nothing to
  migrate or retire, since it was never part of the identity system this spec
  touches.
- **Two corrections found during implementation planning, both narrowing scope
  without changing the goal:** (1) Apple Sign-In in this codebase is native-iOS-only
  today (a different mechanism, native SDK plus device attestation, from the web
  OAuth-popup flow Discord/Google use), so the web-client work in this phase covers
  Google and Discord; native-app Apple/Discord wiring is real follow-on work. (2) the
  email/password login form asks for a **username**, but Firebase's email/password
  auth needs an **email**, two different, not-interchangeable fields, and some
  accounts have no email on file at all. Rather than change the login UX (a real
  product decision, deliberately deferred), password accounts keep the untouched
  legacy username/password path as their real verification authority forever;
  Firebase only gets a mirrored identity for them, provisioned silently in the
  background. See the corrected Section 6.
- **Server-side verification uses the full `firebase-admin` SDK**, not a hand-rolled
  JWT check against Google's JWKS. This accepts the dependency-weight cost (this repo's
  "keep the dependency set tiny" rule) in exchange for the SDK's user-management API,
  which the migration path below relies on (`createUser`/`updateUser`).

## 4. Architecture

Two independent paths, covered in the same phase but touching different code:

**Google and Discord (token-based, new client work):**

1. Client signs in via the Firebase JS client SDK (Google, or Discord via a custom
   OIDC provider config) and receives a Firebase ID token (a short-lived RS256 JWT).
2. Client sends that token to a new server endpoint.
3. Server verifies the token with `firebase-admin`'s `getAuth().verifyIdToken()`
   (locally cached JWKS verification; no per-request network call to Firebase).
4. Server resolves the verified token to an `accounts` row (see Section 5) and issues
   the **existing** `auth_tokens` bearer session, byte-identical in shape to what the
   old login path issues today.
5. Everything downstream of "you have a valid session token" (`ws_auth.ts`, character
   load, every other authenticated route) sees zero change.

**Email/password (no client change at all):** the existing `/api/login` endpoint and
its username/password request body are untouched. On a successful legacy login, the
server silently provisions (or updates) a shadow Firebase user in the background,
using the account's email if it has one; see Section 6.

## 5. Data model

One additive, nullable column: `accounts.firebase_uid TEXT UNIQUE`. Populated
per-account as each one migrates (see Section 6), never backfilled in bulk. No other
schema change. `discord_links` and `apple_auth_links` are read (not written) by the new
flow, as the matching keys described next.

## 6. Migration path for existing accounts

No bulk password import: Firebase's scrypt import format needs exact-parameter
matching with Google's own modified scrypt variant, and this repo's Node `scrypt` call
does not match it. Getting that wrong fails silently at import time or, worse, at
first login. Instead, each account migrates individually, transparently:

- **Discord (and Apple, once a client path for it exists):** user signs in through
  Firebase's Discord provider as normal. The server reads the provider's external
  subject id out of the verified token (Discord user id / Apple subject) and looks it
  up in `discord_links` / `apple_auth_links`. A match resolves to the existing
  `account_id`; the server sets `firebase_uid` on that row. No new account is
  created, no re-authorization beyond the normal provider consent screen, no data
  touched.
- **Email/password:** the one case with no token to match against at all, since
  Firebase's own client SDK requires an email, a field the existing login form does
  not collect (it asks for username). Rather than change that form, migration here
  is a background side effect of the *existing, unmodified* `/api/login` request: on
  a successful legacy `verifyPassword()` check, if the account has an email on file
  and no `firebase_uid` yet, the server calls `firebase-admin`'s `createUser()` (or
  `updateUser()` if the email already exists in Firebase from an abandoned prior
  attempt) with that same verified password, then sets `firebase_uid`. This is
  best-effort: a Firebase outage or error never blocks or fails the login itself. An
  account with no email on file simply does not migrate yet, consistent with this
  app's existing `emailMissing` nudge that already prompts such accounts to add one.

`server/github.ts`/`github_oauth.ts`/`github_db.ts` (the developer-badge linking
feature) are not part of this migration at all: not read, not modified, not
retired. They solve an unrelated problem (crediting merged-PR contributors) that
has nothing to do with account sign-in.

## 7. What retires vs. what stays

| Removed | Kept (and why) |
|---|---|
| The Discord OAuth **handshake** code in `server/discord_oauth.ts` (Firebase's own provider now runs the handshake) | `server/auth.ts`'s `hashPassword`/`verifyPassword`: this stays load-bearing indefinitely, since password accounts keep the legacy path as their real verification authority (Section 6) |
| | `server/apple_auth.ts`: entirely untouched (native-iOS-only today, not part of this phase's client work) |
| | `discord_links` / `apple_auth_links` **tables**: read-only migration-matching keys |
| | `auth_tokens` table and `server/ws_auth.ts`: completely unchanged |
| | The old `/api/register` and `/api/login` routes: kept live, unmodified except for the background-provisioning addition to `/api/login` (see Section 9) |
| | `server/github.ts`/`github_oauth.ts`/`github_db.ts`: entirely unrelated (developer badge, not sign-in), untouched |

## 8. New server module

A new `server/firebase_auth.ts` `RouteDef` module (this repo's module-first
convention: a new server endpoint is always its own `RouteDef` module, never an
inline route in `main.ts`), registered in `server/http/registry.ts` alongside the
existing `authRoutes`. Owns: ID token verification, the account resolve/link/migrate
logic in Section 6, and a small schema addition (the `firebase_uid` column) applied
the same way every other domain schema in this codebase is: idempotent DDL run at
boot under the advisory lock, not a separate migration file.

New dependencies: `firebase-admin` (server) and `firebase` (client SDK; already an
unused line in the old stash mentioned in Section 2). The server additionally needs a
Firebase service-account credential, loaded from the environment
(`process.loadEnvFile()`, the existing `DATABASE_URL` precedent) and never committed.

## 9. Client-side

The Firebase JS SDK is added to the game client's login flow, gaining a new Google
button and repointing the existing Discord button through Firebase instead of its
current OAuth redirect. The email/password form is untouched: it keeps calling the
existing `/api/login` exactly as it does today (Section 6). Firebase's client-side
config (API key, project id, etc.) is not a secret: Firebase's own security model
puts enforcement on the server-side token verification, not on hiding these values,
so it ships as a plain client-side constant, same trust level as any other public
config today.

## 10. Rollout and rollback

The old `/api/register` and `/api/login` endpoints stay live in parallel with the new
Firebase token-resolution path for the full transition window: nothing about this
change removes a working login path on day one, and `/api/login` itself keeps working
identically from the caller's perspective even with the background-provisioning
addition. Once telemetry shows the background provisioning step is going effectively
unused, meaning the accounts that were going to migrate, have, retiring it and the
old Discord OAuth handshake code is a **follow-up change**, explicitly not part of
this phase's completion definition.

## 11. Testing

Route-level tests using the existing `tests/server/helpers/` fakes, covering:

- Fresh signup through the new token-resolution route (provider-agnostic at the
  server layer: Google and Discord arrive as the same verified shape once Firebase's
  client SDK has done its job, so one test covers both).
- First-login migration for an existing Discord-linked account (token subject
  matches `discord_links`, `firebase_uid` set, no duplicate account created); the
  same logic path is exercised for Apple even though no client work produces an
  Apple-provider token yet.
- Session-issuance parity: a migrated login produces an `auth_tokens` row
  indistinguishable in shape from one issued by the legacy path.
- A second login on an already-migrated account goes straight through Firebase
  verification with no re-matching path exercised.
- The background provisioning step on `/api/login`: fires when an account has an
  email and no `firebase_uid`, is skipped when either condition fails, and never
  blocks or fails the login itself even when it throws.

## 12. Explicitly out of scope (this phase)

- Firestore, or any migration of game data (characters, guilds, market, mail, bank,
  and so on) off Postgres. A separate, later spec.
- Removing the old `/api/register`/`/api/login` endpoints, the Discord OAuth
  handshake code, or the background-provisioning step: a follow-up change once
  migration telemetry supports it (Section 10).
- Native-app (Capacitor iOS/Android) Apple and Discord sign-in through Firebase: a
  materially different mechanism (native SDKs, device attestation, the desktop/native
  login-code handoff flows) from the web client's OAuth-popup flow. Real follow-on
  work, not part of this phase.
- Changing the email/password login form's identifier from username to email (which
  would let Firebase become the real verification authority for password accounts
  instead of a mirrored identity): a genuine product/UX decision, deliberately
  deferred (Section 3).
- Any change to the existing TOTP two-factor system on `accounts`; it is independent
  of the sign-in provider and is not touched here.
- Any change to `server/oauth.ts` (this repo's own OAuth *server*, for third-party
  companion apps), an unrelated system.
- Any change to `server/github.ts`/`github_oauth.ts`/`github_db.ts` (the
  developer-badge GitHub linking feature); it is not a sign-in method and this spec
  does not touch it.
