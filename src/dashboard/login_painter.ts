// DOM half of the dashboard login form. Owns the Turnstile widget, the actual
// Api.login/register calls, and all localization (t()), mirroring how
// nameplate_painter.ts owns localization for its pure core's decisions.

import type { Api } from '../net/online';
import {
  ensureTurnstile,
  resetTurnstile,
  type TurnstileHandle,
  turnstileToken,
} from '../net/turnstile';
import { userFacingApiError } from '../ui/api_error_i18n';
import { t } from '../ui/i18n';
import { type LoginFormState, loginFormModel } from './login_view';

const TURNSTILE_SITEKEY = String(import.meta.env.VITE_TURNSTILE_SITEKEY ?? '');
const TURNSTILE_CONTAINER_ID = 'dashboard-cf-turnstile-container';

export class LoginPainter {
  private state: LoginFormState = {
    mode: 'login',
    username: '',
    password: '',
    error: null,
    twoFactorRequired: false,
  };
  private readonly turnstileHandle: TurnstileHandle = { widgetId: undefined };

  constructor(
    private readonly container: HTMLElement,
    private readonly api: Api,
    private readonly onLoggedIn: () => void,
  ) {}

  mount(): void {
    this.render();
    ensureTurnstile(this.turnstileHandle, TURNSTILE_SITEKEY, TURNSTILE_CONTAINER_ID);
  }

  private async submit(
    username: string,
    password: string,
    code: string,
    email: string,
  ): Promise<void> {
    this.state = { ...this.state, username, password, error: null };
    try {
      const token = turnstileToken(TURNSTILE_SITEKEY, this.turnstileHandle);
      const result =
        this.state.mode === 'login'
          ? await this.api.login(username, password, token, code)
          : await this.api.register(username, password, email, token);
      if ('twoFactorRequired' in result && result.twoFactorRequired) {
        this.state = { ...this.state, twoFactorRequired: true };
        this.render();
        return;
      }
      this.api.saveSession();
      this.onLoggedIn();
    } catch (err) {
      resetTurnstile(this.turnstileHandle);
      this.state = { ...this.state, error: userFacingApiError(err) };
      this.render();
    }
  }

  private render(): void {
    const model = loginFormModel(this.state);
    const isLogin = model.mode === 'login';
    this.container.innerHTML = `
      <form class="arc-card" id="dashboard-login-form">
        <h1 class="arc-title">${t(isLogin ? 'dashboard.login.title' : 'dashboard.register.title')}</h1>
        <label>${t('dashboard.login.username')}<input name="username" autocomplete="username" /></label>
        <label>${t('dashboard.login.password')}<input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" /></label>
        ${isLogin ? '' : `<label>${t('dashboard.register.email')}<input name="email" type="email" autocomplete="email" required /></label>`}
        ${model.showTwoFactorField ? `<label>${t('dashboard.login.twoFactorLabel')}<input name="code" inputmode="numeric" maxlength="14" /></label>` : ''}
        <div id="${TURNSTILE_CONTAINER_ID}"></div>
        ${model.errorText ? `<div class="dashboard-login-error">${model.errorText}</div>` : ''}
        <button type="submit" ${model.submitDisabled ? 'disabled' : ''}>${t(isLogin ? 'dashboard.login.submit' : 'dashboard.register.submit')}</button>
        ${isLogin ? `<p>${t('dashboard.login.registerPrompt')} <button type="button" id="dashboard-login-toggle-mode">${t('dashboard.login.registerLink')}</button></p>` : ''}
      </form>
    `;
    const form = this.container.querySelector<HTMLFormElement>('#dashboard-login-form');
    form?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const data = new FormData(form);
      void this.submit(
        String(data.get('username') ?? ''),
        String(data.get('password') ?? ''),
        String(data.get('code') ?? ''),
        String(data.get('email') ?? ''),
      );
    });
    this.container.querySelector('#dashboard-login-toggle-mode')?.addEventListener('click', () => {
      this.state = { ...this.state, mode: 'register', error: null };
      this.render();
    });
  }
}
