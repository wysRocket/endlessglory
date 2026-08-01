// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { turnstileToken } from '../src/net/turnstile';

describe('Turnstile token reader', () => {
  it('returns empty when no site key is configured', () => {
    expect(turnstileToken('')).toBe('');
  });

  it('returns empty when the widget has not rendered (no widget id)', () => {
    (window as unknown as { turnstile?: unknown }).turnstile = {
      getResponse: vi.fn(() => 'should-not-be-read'),
    };
    expect(turnstileToken('site-key-configured')).toBe('');
    delete (window as unknown as { turnstile?: unknown }).turnstile;
  });
});
