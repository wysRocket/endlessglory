import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vite';
import { loadBrowserslistFloors } from './scripts/browserslist_targets.mjs';
// Untyped zero-dep build helper (same convention as the other scripts/*.mjs tools).
// vite.config.ts is outside tsconfig `include`, so this import is never type-checked.
import { visualThemeHtmlPlugin } from './scripts/lib/visual_theme_html';

const root = fileURLToPath(new URL('.', import.meta.url));

// Lightning CSS engine targets, derived from .browserslistrc (the single source of
// the floor) via the zero-dep parser, never a hand-typed object. Drives both the
// CSS transform and the minifier below, so the floor governs which prefixes and
// fallbacks survive minification (for example the -webkit-backdrop-filter twin).
const cssTargets = browserslistToTargets(
  loadBrowserslistFloors(fileURLToPath(new URL('.browserslistrc', import.meta.url))),
);

// `#bot-detector` → the private detector if its clone is present, else the no-op
// stub. Mirrors scripts/build_server.mjs (bundle) and tsconfig.json `paths` (tsc).
const privateBotDetector = fileURLToPath(
  new URL('private/bot_detector/src/index.ts', import.meta.url),
);
const botDetectorImpl = existsSync(privateBotDetector)
  ? privateBotDetector
  : fileURLToPath(new URL('server/bot_detector/stub.ts', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version?: string;
};

function env(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function gitSha(): string | undefined {
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

const appVersion = pkg.version ?? env(['APP_VERSION', 'npm_package_version']) ?? '0.0.0';
const appBuildDate = env(['APP_BUILD_DATE', 'BUILD_DATE']) ?? new Date().toISOString();
const appBuildId =
  env([
    'APP_BUILD_ID',
    'APP_BUILD_NUMBER',
    'BUILD_NUMBER',
    'GITHUB_RUN_NUMBER',
    'RENDER_BUILD_ID',
    'RENDER_GIT_COMMIT',
    'VERCEL_GIT_COMMIT_SHA',
    'CF_PAGES_COMMIT_SHA',
  ]) ??
  gitSha() ??
  appBuildDate.replace(/[-:TZ.]/g, '').slice(0, 12);
const desktopApiOrigin = env(['VITE_DESKTOP_API_ORIGIN']);
const isDesktopDevBuild = env(['VITE_DESKTOP_APP']) === '1';
const apiProxyTarget =
  env(['WOC_DEV_API_TARGET']) ??
  (isDesktopDevBuild && desktopApiOrigin ? desktopApiOrigin : 'http://127.0.0.1:8787');
const wsProxyTarget = apiProxyTarget.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

// Pretty-URL aliases for standalone static HTML pages. Mirrors the production
// server rewrite in server/main.ts so these paths resolve in dev and preview too.
const STATIC_PAGE_ALIASES = new Map([
  ['/links', '/links.html'],
  ['/links/', '/links.html'],
  ['/social', '/links.html'],
  ['/social/', '/links.html'],
  ['/social-media-links', '/links.html'],
  ['/social-media-links/', '/links.html'],
  ['/wallet-handoff', '/wallet-handoff.html'],
  ['/wallet-handoff/', '/wallet-handoff.html'],
  ['/privacy', '/privacy.html'],
  ['/privacy/', '/privacy.html'],
  ['/terms', '/terms.html'],
  ['/terms/', '/terms.html'],
  ['/merch', '/merch.html'],
  ['/merch/', '/merch.html'],
  ['/press', '/press.html'],
  ['/press/', '/press.html'],
  ['/data-deletion', '/data-deletion.html'],
  ['/data-deletion/', '/data-deletion.html'],
  ['/support', '/support.html'],
  ['/support/', '/support.html'],
  ['/wiki', '/guide.html'],
  ['/wiki/', '/guide.html'],
  ['/editor', '/editor.html'],
  ['/editor/', '/editor.html'],
]);
// The Guide is the site wiki: a client-routed SPA at /wiki. Deep paths like
// /wiki/classes/warrior have no static file, so any extensionless /wiki* request falls
// back to guide.html (mirrored in server/main.ts serveStatic). Asset requests under
// /wiki keep their extension and are left alone so they 404 rather than serving HTML.
function isGuideSpaPath(pathOnly: string): boolean {
  if (pathOnly !== '/wiki' && !pathOnly.startsWith('/wiki/')) return false;
  const last = pathOnly.slice(pathOnly.lastIndexOf('/') + 1);
  return !last.includes('.');
}
function staticPageAliasPlugin() {
  const rewrite = (req: { url?: string }) => {
    const url = req.url ?? '';
    const pathOnly = url.split('?')[0];
    const target =
      STATIC_PAGE_ALIASES.get(pathOnly) ?? (isGuideSpaPath(pathOnly) ? '/guide.html' : undefined);
    if (target) req.url = target + url.slice(pathOnly.length);
  };
  const attach = (server: {
    middlewares: {
      use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void;
    };
  }) => {
    server.middlewares.use((req, _res, next) => {
      rewrite(req);
      next();
    });
  };
  return { name: 'woc-static-page-alias', configureServer: attach, configurePreviewServer: attach };
}

// Phase 4 (i18n Lazy Locales): the lazy-locale modulepreload templating (resolve each
// locale chunk's content-hashed URL from Vite's manifest into dist/index.html) runs as a
// standalone post-build step, `node scripts/i18n_modulepreload_apply.mjs`, wired into the
// `build` npm script AFTER `vite build`. It used to live in a `closeBundle` 'post' hook
// here, but under rolldown-vite that hook raced the manifest writer and failed on Vercel's
// build container (ENOENT on dist/.vite/manifest.json); running it after the build process
// exits removes the ordering dependency. See scripts/i18n_modulepreload{,_apply}.mjs.

// Dev-only save endpoint for the music editor (music_editor.html): receives the
// edited theme map as JSON and writes src/game/music_overrides.generated.ts so
// the game, tests, and render tool pick the edits up immediately via HMR.
// configureServer only runs under the dev server, so this never ships.
function musicEditorSavePlugin() {
  const INST_RE = /^[a-zA-Z]{2,20}$/;
  const NAME_RE = /^[a-z0-9_]{1,40}$/;
  type RawEvent = { beat?: unknown; midi?: unknown; dur?: unknown; vel?: unknown; inst?: unknown };
  type RawTheme = { bpm?: unknown; bars?: unknown; events?: RawEvent[] };
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const validTheme = (t: RawTheme): boolean =>
    !!t &&
    isNum(t.bpm) &&
    t.bpm > 20 &&
    t.bpm < 400 &&
    Number.isInteger(t.bars) &&
    (t.bars as number) > 0 &&
    (t.bars as number) <= 128 &&
    Array.isArray(t.events) &&
    t.events.length <= 20000 &&
    t.events.every(
      (e) =>
        isNum(e.beat) &&
        isNum(e.midi) &&
        isNum(e.dur) &&
        isNum(e.vel) &&
        typeof e.inst === 'string' &&
        INST_RE.test(e.inst),
    );
  const round = (v: number, places: number) => {
    const p = 10 ** places;
    return Math.round(v * p) / p;
  };
  return {
    name: 'woc-music-editor-save',
    configureServer(server: {
      middlewares: {
        use: (
          route: string,
          fn: (
            req: { method?: string; on: (ev: string, cb: (chunk?: unknown) => void) => void },
            res: { statusCode: number; end: (body?: string) => void },
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use('/__music_editor/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += String(chunk);
          if (body.length > 8_000_000) {
            res.statusCode = 413;
            res.end('too large');
          }
        });
        req.on('end', () => {
          try {
            type SavedEvent = {
              beat: number;
              midi: number;
              dur: number;
              vel: number;
              inst: string;
            };
            type SavedTheme = { bpm: number; bars: number; events: SavedEvent[] };
            const overrides = JSON.parse(body) as Record<string, SavedTheme>;
            const names = Object.keys(overrides);
            if (
              !names.every((n) => NAME_RE.test(n)) ||
              !names.every((n) => validTheme(overrides[n]))
            ) {
              res.statusCode = 400;
              res.end('invalid payload');
              return;
            }
            const lines: string[] = [
              '// Generated by music_editor.html (dev tool): themes edited in the browser are',
              '// saved here and override the composed versions in buildMusicThemes(), for the',
              '// game, the tests, and the render tool alike. Do not hand-edit: run',
              '// npm run dev, open /music_editor.html, edit, and press Save.',
              "import type { Theme } from './music';",
              '',
              'export const MUSIC_OVERRIDES: Record<string, Theme> = {',
            ];
            for (const name of names) {
              const t = overrides[name];
              lines.push(
                `  ${name}: {`,
                `    bpm: ${t.bpm},`,
                `    bars: ${t.bars},`,
                '    events: [',
              );
              const sorted = [...t.events].sort((a, b) => a.beat - b.beat);
              for (const e of sorted) {
                const vel = round(Math.min(1, Math.max(0.005, e.vel)), 3);
                lines.push(
                  '      { beat: ' +
                    round(e.beat, 4) +
                    ', midi: ' +
                    Math.round(e.midi) +
                    ', dur: ' +
                    round(e.dur, 4) +
                    ', vel: ' +
                    vel +
                    ", inst: '" +
                    e.inst +
                    "' },",
                );
              }
              lines.push('    ],', '  },');
            }
            lines.push('};', '');
            writeFileSync(
              path.resolve(root, 'src/game/music_overrides.generated.ts'),
              lines.join('\n'),
            );
            res.statusCode = 200;
            res.end('ok');
          } catch (err) {
            res.statusCode = 400;
            res.end(String(err));
          }
        });
      });
    },
  };
}

// Fail the build on an import cycle inside src/render/.
//
// Why this exists (incident, 2026-08-01, fixed in 98c32c3b4): src/render/emberwood/
// materials.ts imported a table from src/render/props.ts while props.ts imported the
// selector back. Vitest stayed green throughout, because it runs through Vite's SSR
// transform, which resolves cycles lazily. The bundler does not: it emitted
// materials.ts first, so a module-scope `{...MAT_OVERRIDES}` spread read a binding
// that was still undefined. `{...undefined}` is legal and evaluates to `{}`, so the
// shipped bundle carried 1 material override instead of 19 and silently dropped a
// whole theme's palette. It was caught by reading the emitted chunk by hand.
//
// No test can catch this class of bug: the Vitest layer never exercises the bundler's
// module ordering. The build is the only place it is visible, so the guard lives here.
//
// Scoped to src/render/ deliberately. A survey of an instrumented build found roughly
// thirty pre-existing cycles in node_modules (svelte, viem, @reown/appkit,
// @solana/spl-token, ox, walletconnect) and one in first-party code,
// src/sim/delves/runs.ts with drowned_litany_rite.ts. Guarding the whole tree would
// block every build on dependencies we do not control. src/render/ is clean today,
// so this starts green and stays honest. Widening it means fixing that delves cycle
// first.
const CYCLE_GUARD_PATH = 'src/render/';

function isRenderCycle(ids: readonly string[] | undefined, message: string): boolean {
  const haystack = ids?.length ? ids.join('\n') : message;
  return haystack.includes(CYCLE_GUARD_PATH);
}

export default defineConfig({
  base: '/',
  // The Svelte plugin only transforms the standalone admin entry. The testing
  // plugin is scoped to Vitest so it cannot affect production client builds.
  plugins: [
    svelte(),
    ...(process.env.VITEST ? [svelteTesting()] : []),
    staticPageAliasPlugin(),
    visualThemeHtmlPlugin(),
    musicEditorSavePlugin(),
  ],
  resolve: { alias: { '#bot-detector': botDetectorImpl } },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_ID__: JSON.stringify(appBuildId.slice(0, 12)),
    __APP_BUILD_DATE__: JSON.stringify(appBuildDate),
  },
  // Lightning CSS handles all CSS transform and minify. Under the lightningcss
  // transformer css.postcss is inert, so no postcss.config is consulted and the
  // project stays vanilla (no Tailwind, no PostCSS plugins).
  css: {
    transformer: 'lightningcss',
    lightningcss: { targets: cssTargets },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: true },
      '/admin/api': { target: apiProxyTarget, changeOrigin: true },
      '/ws': { target: wsProxyTarget, ws: true },
      // MediaWiki community wiki runs as its own container on :8080. Proxy /wiki*
      // to it so the in-app "Browse the Wiki" link resolves in dev too - mirrors
      // the prod reverse-proxy route (nginx /wiki -> :8080). Needs the container
      // up: `docker compose up -d mediawiki mediawiki-db`.
      '/wiki': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    chunkSizeWarningLimit: 1500,
    // Emit dist/.vite/manifest.json so the Phase 4 modulepreload hook can resolve each
    // lazy locale chunk's content-hashed filename. Metadata only - does not perturb the
    // bundle or move the resolved-table SHA.
    manifest: true,
    rollupOptions: {
      // Cycle detection is OFF by default in this bundler, so enabling it is half
      // the guard: onwarn alone would sit here catching nothing and look like
      // protection. See the CYCLE_GUARD_PATH note above.
      checks: { circularDependency: true },
      onwarn(warning, defaultHandler) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') {
          const ids = (warning as { ids?: readonly string[] }).ids;
          if (isRenderCycle(ids, warning.message ?? '')) {
            const cycle = ids?.length
              ? ids.map((id) => id.replace(root, '')).join('\n  -> ')
              : (warning.message ?? 'unknown cycle');
            throw new Error(
              `Import cycle inside ${CYCLE_GUARD_PATH}:\n  -> ${cycle}\n\n` +
                'This fails the build on purpose. A cycle here is not a style problem: ' +
                'the bundler picks an emit order, and a module-scope read of a binding ' +
                'from the other side of the cycle sees undefined. That is silent and ' +
                'the test suite cannot see it (Vitest resolves cycles lazily), which is ' +
                'how a theme once shipped with 1 material override instead of 19.\n' +
                'Fix by moving the shared value into a leaf module both sides import, ' +
                'as src/render/prop_materials.ts does.',
            );
          }
          // Every other cycle is pre-existing (mostly node_modules, plus
          // src/sim/delves). Enabling the check made them visible; stay quiet about
          // them so build output is no noisier than before this guard existed.
          return;
        }
        defaultHandler(warning);
      },
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        admin: fileURLToPath(new URL('admin.html', import.meta.url)),
        guide: fileURLToPath(new URL('guide.html', import.meta.url)),
        editor: fileURLToPath(new URL('editor.html', import.meta.url)),
        dashboard: fileURLToPath(new URL('dashboard.html', import.meta.url)),
        walletHandoff: fileURLToPath(new URL('wallet-handoff.html', import.meta.url)),
      },
      output: {
        // three.js almost never changes between our releases and is the single
        // heaviest dependency in the game/editor bundles; splitting it into its
        // own chunk lets the browser fetch it in parallel with app code and
        // reuse the browser cache across app-only redeploys (its content hash
        // stays stable unless the three version itself bumps).
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules/three/')) return 'vendor-three';
          return undefined;
        },
      },
    },
  },
  test: {
    // server/db.ts (and every module importing it) requires DATABASE_URL at module
    // load. Locally db.ts fills it from .env; a CI checkout has no .env, so default
    // a dummy here to keep the suite runnable in plain Node. Unit tests never open
    // a connection (the pg Pool connects only on first query, and db-touching tests
    // use FakeDb/mocks), and a real DATABASE_URL from the shell still wins.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://vitest:vitest@127.0.0.1:5433/wocc_vitest_dummy',
    },
    globalSetup: ['./tests/global_setup.ts'],
    // Runs per test file (unlike globalSetup, which runs once outside any
    // jsdom environment); see the file for why this is needed on Node 22+.
    setupFiles: ['./tests/jsdom_local_storage_setup.ts'],
    // Two kinds of exclusion, kept together:
    // - agent-runtime directories may contain local worktree copies, and their tracked
    //   config or instruction files are not product test sources. Excluding them keeps a
    //   stale local worktree from duplicating tests. .venv is local Python tooling.
    // - the opt-in browser suite (vitest.browser.config.ts, npm run test:browser) must NOT
    //   leak into a bare `vitest run`: excluding its files keeps the default Node run from
    //   importing the Playwright provider or launching a browser. Cross-engine CI is P17b.
    // - tmp/ is gitignored scratch (screenshot tours, the new:endpoint golden test's emitted
    //   *.test.ts under a temp root); excluding it keeps a crashed golden run's orphan emitted
    //   test out of a bare `vitest run`. The golden test runs its emitted test through a child
    //   vitest with an explicit --config override so this exclude does not block it.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/.codex/**',
      '**/.agents/**',
      '**/.venv/**',
      'tmp/**',
      'tests/browser/**',
      '**/*.browser.test.ts',
    ],
  },
});
