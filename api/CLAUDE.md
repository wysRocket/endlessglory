# api/: Vercel serverless auth backend for endless-glory.vercel.app

A small, SEPARATE backend from `server/`. The Vercel-hosted static mirror of the game
client (`endless-glory.vercel.app`) has no persistent process, so it cannot run the
real game server (`server/main.ts`'s live `Sim` tick loop + WebSocket multiplayer).
This directory exists only to unblock login on that site: register, login, and
Firebase (Google) sign-in, backed by their own small Postgres (Supabase project
`endless-glory-auth`, env `AUTH_DATABASE_URL`), fully separate from
`worldofclaudecraft.com`'s player database and accounts.

## Scope: auth only, deliberately minimal
No characters, no real-time gameplay, no TOTP/2FA, no moderation, no Turnstile, no
email delivery, no Discord/Apple linking. Each handler is a deliberately smaller
version of its `server/` counterpart (`server/auth_routes.ts`, `server/firebase_auth.ts`),
matching the SAME wire contract (request/response shape, error `code`s from
`src/ui/i18n.catalog/api_error.ts`) so the existing game client needs no changes, but
reimplemented rather than importing those RouteDef handlers directly: they assume the
full game schema (moderation columns, discord_links/apple_auth_links, TOTP) that this
accounts table does not have.

## What's reused vs. reimplemented
- Reused verbatim (pure, dependency-free): `server/auth.ts` (hashPassword,
  verifyPassword, newToken, the validators) and `server/firebase_admin.ts`
  (verifyFirebaseIdToken). Never duplicate this logic here.
- Reimplemented locally: `_src/_lib/db.ts` (a minimal accounts + auth_tokens store
  against `AUTH_DATABASE_URL`, NOT `server/db.ts`'s pool/schema) and `_src/_lib/http.ts`
  (a tiny request/response helper; no `@vercel/node` or `server/http/` RouteDef
  pipeline).

## Build shape: source in `_src/`, bundled output at the routed path
Source lives under `api/_src/` (a `_`-prefixed directory, which Vercel's file-based
routing never auto-routes). `scripts/build_api.mjs` (run by `npm run build:api`, chained
into `npm run build`) esbuild-BUNDLES each entry (`bundle:true`, inlining every
dependency) into the actual routed file Vercel deploys: `api/_src/register.ts` to
`api/register.js`, `api/_src/login.ts` to `api/login.js`,
`api/_src/auth/firebase.ts` to `api/auth/firebase.js`. Those three `api/*.js` files are
gitignored generated output, same as `dist-server/`: never hand-edit them, and never
commit them.

Full bundling (not Vercel's own default per-file transpile) is required here, not a
style choice: Vercel's Node runtime transpiles each `api/*.ts` file individually without
bundling `node_modules`, and `firebase-admin` pulls in `jwks-rsa`, which does a plain
CommonJS `require()` of the ESM-only `jose` package, a crash
(`ERR_REQUIRE_ESM`) that only a build-time bundler can resolve (mirrors why
`scripts/build_server.mjs` bundles the real game server the same way).

## Adding a route
A new `api/_src/<name>.ts` (or `api/_src/<domain>/<name>.ts`) source file needs a
matching entry added to the `ENTRIES` list in `scripts/build_api.mjs`, which then
produces its routed `api/<name>.js` counterpart. Files/directories under `_lib/` are
never routed (Vercel's `_`-prefix convention) and need no `ENTRIES` entry. Keep new
endpoints in this same minimal style: validate input, one or two `_lib/db.ts` calls,
respond with the exact shape `src/net/online.ts` expects.

## Env vars (Vercel production only, never in `.env.example`: these are Vercel-only)
- `AUTH_DATABASE_URL`: the Supabase pooled (port 6543, transaction mode) connection
  string for the `endless-glory-auth` project.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the `firebase-adminsdk` service-account key for the
  `endless-glory` Firebase project (same project as the client's `VITE_FIREBASE_*`
  vars), required for `verifyFirebaseIdToken` to verify Google sign-in tokens.

## Do not
- Do not point this at `worldofclaudecraft.com`'s database or reuse its `DATABASE_URL`:
  the whole reason this exists is to keep the two player bases separate.
- Do not add real-time/WebSocket code here: Vercel functions are stateless and
  short-lived, incompatible with the authoritative `Sim` tick loop.
- Do not import from `server/db.ts`, `server/auth_routes.ts`, or `server/firebase_auth.ts`
  directly (their queries assume tables this schema does not have); import only the
  pure helpers named above.
