import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWalletHandoffBrowserUrl,
  parseWalletHandoffDeepLink,
  sanitizeWalletHandoffCode,
} from '../electron/wallet_handoff.cjs';

describe('Electron wallet browser handoff', () => {
  const code = 'A'.repeat(43);

  it('puts the secret in the URL fragment so it is not sent in the HTTP request', () => {
    const url = buildWalletHandoffBrowserUrl('https://worldofclaudecraft.com', code);
    expect(url).toBe(`https://worldofclaudecraft.com/wallet-handoff#code=${code}`);
    expect(new URL(url).search).toBe('');
  });

  it('accepts only canonical handoff codes', () => {
    expect(sanitizeWalletHandoffCode(code)).toBe(code);
    expect(sanitizeWalletHandoffCode('short')).toBeNull();
    expect(sanitizeWalletHandoffCode(`${code}?x=1`)).toBeNull();
  });

  it('parses only the wallet-handoff custom protocol target', () => {
    expect(parseWalletHandoffDeepLink(`endlessglory://wallet-handoff?code=${code}`)).toEqual({
      code,
    });
    expect(parseWalletHandoffDeepLink(`endlessglory://desktop-login?code=${code}`)).toBeNull();
    expect(
      parseWalletHandoffDeepLink(`https://example.com/wallet-handoff?code=${code}`),
    ).toBeNull();
  });

  it('emits the same registered callback scheme from the browser return page', () => {
    // Both sides of the handoff seam (this page and electron/wallet_handoff.cjs)
    // must agree on the scheme, and neither may still carry the retired upstream
    // one: a half-rename would make every wallet handoff die silently.
    const entry = readFileSync(join(__dirname, '..', 'src', 'wallet_handoff.ts'), 'utf8');
    expect(entry).toContain('endlessglory://wallet-handoff?code=');
    expect(entry).not.toContain('worldofclaudecraft://');
  });

  it('localizes the standalone browser page title at runtime', () => {
    const root = join(__dirname, '..');
    const html = readFileSync(join(root, 'wallet-handoff.html'), 'utf8');
    const entry = readFileSync(join(root, 'src/wallet_handoff.ts'), 'utf8');
    expect(html).toContain('<title></title>');
    expect(entry).toContain("document.title = t('wallet.browser.eyebrow')");
  });
});
