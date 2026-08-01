// Dashboard client entry (the /dashboard Vite entry, loaded by dashboard.html).
// Mirrors src/guide/main.ts: load the active locale, then mount. Session restore
// and auth gating happen in shell.ts, not here; this file is boot plumbing only.

import './styles.css';
import { ensureLocaleLoaded, getLanguage } from '../ui/i18n';
import { DashboardShell } from './shell';

async function boot(): Promise<void> {
  const mount = document.getElementById('dashboard-app');
  if (!mount) return;
  try {
    await ensureLocaleLoaded(getLanguage());
  } catch {
    // A missing locale chunk falls back to English; render regardless.
  }
  new DashboardShell(mount).start();
}

void boot();
