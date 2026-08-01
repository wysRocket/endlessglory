// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { type TurnstileHandle, turnstileToken } from '../src/net/turnstile';

describe('Turnstile token reader', () => {
  it('returns empty when no site key is configured', () => {
    expect(turnstileToken('')).toBe('');
  });

  it('returns empty when no handle is supplied', () => {
    (window as unknown as { turnstile?: unknown }).turnstile = {
      getResponse: vi.fn(() => 'should-not-be-read'),
    };
    expect(turnstileToken('site-key-configured')).toBe('');
    delete (window as unknown as { turnstile?: unknown }).turnstile;
  });

  it('returns empty when the widget has not rendered (handle has no widget id)', () => {
    (window as unknown as { turnstile?: unknown }).turnstile = {
      getResponse: vi.fn(() => 'should-not-be-read'),
    };
    const handle: TurnstileHandle = { widgetId: undefined };
    expect(turnstileToken('site-key-configured', handle)).toBe('');
    delete (window as unknown as { turnstile?: unknown }).turnstile;
  });

  it('reads the response from a rendered widget via its handle', () => {
    (window as unknown as { turnstile?: unknown }).turnstile = {
      getResponse: vi.fn((widgetId?: string) => (widgetId === 'widget-42' ? 'solved-token' : '')),
    };
    const handle: TurnstileHandle = { widgetId: 'widget-42' };
    expect(turnstileToken('site-key-configured', handle)).toBe('solved-token');
    delete (window as unknown as { turnstile?: unknown }).turnstile;
  });
});
