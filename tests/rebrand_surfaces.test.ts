import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = join(root, 'public');
const publicSurfaceExtensions = new Set(['.html', '.md', '.txt', '.xml', '.webmanifest']);

function listPublicSurfaces(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listPublicSurfaces(path);
    return publicSurfaceExtensions.has(extname(entry.name)) ? [relative(root, path)] : [];
  });
}

const publicSurfaces = listPublicSurfaces(publicRoot);
const sourceSurfaces = [
  'index.html',
  'guide.html',
  'admin.html',
  'editor.html',
  'wallet-handoff.html',
  'src/main.ts',
  'src/wallet_handoff.ts',
  'src/guide/head.ts',
  'src/guide/chrome.ts',
  'src/guide/pages/home.ts',
  'electron/main.cjs',
  'electron/shell_strings.cjs',
  'scripts/seo_audit.mjs',
  'scripts/guide_e2e.mjs',
  'scripts/links_verify.mjs',
  'scripts/links_playwright.mjs',
  'scripts/homepage_verify.mjs',
  'DESIGN.md',
  '.claude/skills/review-pr/SKILL.md',
  ...publicSurfaces,
];

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function readBytes(path: string): Buffer {
  return readFileSync(join(root, path));
}

function withoutCompatibilityIdentifiers(path: string, source: string): string {
  let scrubbed = source;
  if (path === 'index.html') {
    // The desktop download URLs are gone; only the whitepaper filename remains.
    scrubbed = scrubbed.replace('/World-of-ClaudeCraft-Whitepaper-v1.0.pdf', '');
  }
  if (path === 'src/wallet_handoff.ts') {
    scrubbed = scrubbed.replace('worldofclaudecraft://wallet-handoff', '');
  }
  return scrubbed;
}

describe('Endless Glory emitted surfaces', () => {
  it.each(sourceSurfaces)(
    '%s contains no retired user-facing brand, domain, logo, or /play URL',
    (path) => {
      const source = withoutCompatibilityIdentifiers(path, read(path));
      expect(source, path).not.toMatch(/World of ClaudeCraft|World of Claudecraft/);
      expect(source, path).not.toContain('worldofclaudecraft.com');
      expect(source, path).not.toMatch(/woc_logo_square|worldofclaudecraft-logo/);
      expect(source, path).not.toMatch(/(?:href=|url(?:Template)?:)[^\n]*\/play\b/);
    },
  );

  // The infrastructure half of the rebrand, distinct from the user-facing sweep
  // above. These are not cosmetic: the publish feed decides what code installed
  // desktop apps download, PRODUCTION_API_ORIGIN is the backend the desktop app
  // talks to by default, and the server origins land in verification emails and
  // shareable player-card URLs. An upstream value in any of them points this
  // game's users, or its update channel, at somebody else's infrastructure.
  it('never points its own infrastructure at upstream hosts', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      description: string;
      author: { name: string };
      build: { publish: { url: string } };
    };
    expect(packageJson.build.publish.url).not.toContain('worldofclaudecraft');
    expect(packageJson.description).not.toMatch(/Claudecraft|ClaudeCraft/);
    expect(JSON.stringify(packageJson.author)).not.toMatch(/Levy Street|levystreet/);

    for (const path of [
      'electron/update_guard.cjs',
      'server/realm.ts',
      'server/player_card.ts',
      'server/email/index.ts',
    ]) {
      expect(read(path), path).not.toContain('worldofclaudecraft.com');
    }

    // The release-news feed and the contributor-badge system default to a repo
    // slug; an upstream slug here served the ORIGINAL game's release notes to
    // this game's Welcome Screen and credited its contributor list.
    for (const path of ['server/http/config.ts', 'server/github_contributors.ts']) {
      expect(read(path), path).not.toContain('levy-street');
    }
  });

  // ONE legacy carve-out remains, down from two. The desktop download surface was
  // removed outright (it served upstream-hosted binaries), so index.html no longer
  // needs the updates.worldofclaudecraft.com exception. The wallet-handoff scheme
  // stays: it is registered with the OS on existing installs, so renaming it would
  // break deep links for anyone who already installed the app.
  it('keeps only the registered protocol scheme as a legacy carve-out', () => {
    const index = read('index.html');
    const handoff = read('src/wallet_handoff.ts');
    expect(index).not.toContain('updates.worldofclaudecraft.com');
    expect(index).not.toContain('world-of-claudecraft-');
    expect(handoff).toContain('worldofclaudecraft://wallet-handoff');
    expect(handoff).not.toContain('endlessglory://wallet-handoff');
  });

  it('brands the desktop package while preserving the registered protocol scheme', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      build: {
        productName: string;
        icon: string;
        files: string[];
        protocols: Array<{ name: string; schemes: string[] }>;
        mac: { icon: string };
        win: { icon: string };
        linux: { icon: string };
      };
    };
    expect(packageJson.build.productName).toBe('Endless Glory');
    expect(packageJson.scripts['icons:build']).toBe('node scripts/build_native_icons.mjs');
    expect(packageJson.build.icon).toBe('build/icon.png');
    expect(packageJson.build.mac.icon).toBe('build/icon.icns');
    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.linux.icon).toBe('build/icon.png');
    expect(packageJson.build.files).toEqual(
      expect.arrayContaining(['build/icon.png', 'build/icon.ico', 'build/icon.icns']),
    );
    expect(packageJson.build.protocols).toEqual([
      { name: 'Endless Glory Login', schemes: ['worldofclaudecraft'] },
    ]);
  });

  it('builds every native icon from the approved Endless Glory square', async () => {
    const approved = readBytes('public/endless-glory-square.png');
    const png = readBytes('build/icon.png');
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
    expect(png.equals(approved)).toBe(true);

    const ico = readBytes('build/icon.ico');
    expect(ico.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    const icoCount = ico.readUInt16LE(4);
    expect(icoCount).toBe(7);
    const icoSizes: number[] = [];
    for (let index = 0; index < icoCount; index += 1) {
      const entryOffset = 6 + index * 16;
      const size = ico.readUInt8(entryOffset) || 256;
      const height = ico.readUInt8(entryOffset + 1) || 256;
      expect(height).toBe(size);
      expect(ico.readUInt16LE(entryOffset + 4)).toBe(1);
      expect(ico.readUInt16LE(entryOffset + 6)).toBe(32);
      const frameLength = ico.readUInt32LE(entryOffset + 8);
      const frameOffset = ico.readUInt32LE(entryOffset + 12);
      const frame = ico.subarray(frameOffset, frameOffset + frameLength);
      expect(frame.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const actualPixels = await sharp(frame).ensureAlpha().raw().toBuffer();
      const approvedPixels = await sharp(approved)
        .resize(size, size)
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(actualPixels.equals(approvedPixels), `ICO ${size}px frame`).toBe(true);
      icoSizes.push(size);
    }
    expect(icoSizes).toEqual([16, 24, 32, 48, 64, 128, 256]);

    const icns = readBytes('build/icon.icns');
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    const chunks = new Map<string, Buffer>();
    for (let offset = 8; offset < icns.length; ) {
      const type = icns.subarray(offset, offset + 4).toString('ascii');
      const length = icns.readUInt32BE(offset + 4);
      expect(length, `${type} ICNS chunk length`).toBeGreaterThanOrEqual(8);
      expect(offset + length, `${type} ICNS chunk bounds`).toBeLessThanOrEqual(icns.length);
      chunks.set(type, icns.subarray(offset + 8, offset + length));
      offset += length;
    }
    expect([...chunks.keys()]).toEqual(
      expect.arrayContaining(['ic04', 'ic05', 'ic07', 'ic08', 'ic09', 'ic10']),
    );
    const icns512 = chunks.get('ic09');
    expect(icns512).toBeDefined();
    const icnsPixels = await sharp(icns512).ensureAlpha().raw().toBuffer();
    const approvedPixels = await sharp(approved).ensureAlpha().raw().toBuffer();
    expect(icnsPixels.equals(approvedPixels)).toBe(true);
  });

  it('pins the homepage verifier to the shipped Endless Glory metadata', () => {
    const verifier = read('scripts/homepage_verify.mjs');
    expect(verifier).toContain("pageTitle !== 'Endless Glory: Classic-Style Web MMO'");
    expect(verifier).toContain("metaDescription?.includes('Endless Glory')");
    expect(verifier).toContain('await waitForServer(URL)');
    expect(verifier).not.toContain('project-stats');
    expect(verifier).not.toContain("waitUntil: 'networkidle0'");
  });
});
