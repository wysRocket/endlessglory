import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardHtml = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const mainTs = readFileSync(new URL('../src/dashboard/main.ts', import.meta.url), 'utf8');
const stylesCss = readFileSync(new URL('../src/dashboard/styles.css', import.meta.url), 'utf8');

describe('dashboard entry wiring', () => {
  it('loads src/dashboard/main.ts as its one module script', () => {
    expect(dashboardHtml.match(/src="\/src\/dashboard\/main\.ts"/g)).toHaveLength(1);
  });

  it('carries the arcane surface data attribute on the root element', () => {
    expect(dashboardHtml).toMatch(/<html[^>]*data-surface="arcane"/);
  });

  it('main.ts imports the entry style barrel', () => {
    expect(mainTs).toContain("import './styles.css'");
  });

  it('the style barrel imports both track-0 arcane files', () => {
    expect(stylesCss).toContain("@import '../styles/arcane.tokens.css'");
    expect(stylesCss).toContain("@import '../styles/arcane.components.css'");
  });
});
