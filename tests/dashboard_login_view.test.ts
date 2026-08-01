import { describe, expect, it } from 'vitest';
import { type LoginFormState, loginFormModel } from '../src/dashboard/login_view';

describe('dashboard login view', () => {
  it('shows the login form with no errors in the idle state', () => {
    const state: LoginFormState = {
      mode: 'login',
      username: '',
      password: '',
      error: null,
      twoFactorRequired: false,
    };
    const model = loginFormModel(state);
    expect(model.mode).toBe('login');
    expect(model.showTwoFactorField).toBe(false);
    expect(model.errorText).toBeNull();
    expect(model.submitDisabled).toBe(true);
  });

  it('enables submit once both fields are filled', () => {
    const state: LoginFormState = {
      mode: 'login',
      username: 'a',
      password: 'b',
      error: null,
      twoFactorRequired: false,
    };
    expect(loginFormModel(state).submitDisabled).toBe(false);
  });

  it('surfaces a two factor field once the server requests one', () => {
    const state: LoginFormState = {
      mode: 'login',
      username: 'a',
      password: 'b',
      error: null,
      twoFactorRequired: true,
    };
    const model = loginFormModel(state);
    expect(model.showTwoFactorField).toBe(true);
    // Submit stays disabled until a code is entered, tracked separately by the
    // painter's own input value; the view only knows a code field is required.
  });

  it('surfaces a server error verbatim: the painter is responsible for localizing it', () => {
    const state: LoginFormState = {
      mode: 'login',
      username: 'a',
      password: 'b',
      error: 'invalid credentials',
      twoFactorRequired: false,
    };
    expect(loginFormModel(state).errorText).toBe('invalid credentials');
  });

  it('switches labels between login and register mode without changing field validity logic', () => {
    const loginState: LoginFormState = {
      mode: 'login',
      username: 'a',
      password: 'b',
      error: null,
      twoFactorRequired: false,
    };
    const registerState: LoginFormState = {
      mode: 'register',
      username: 'a',
      password: 'b',
      error: null,
      twoFactorRequired: false,
    };
    expect(loginFormModel(loginState).mode).toBe('login');
    expect(loginFormModel(registerState).mode).toBe('register');
    expect(loginFormModel(loginState).submitDisabled).toBe(
      loginFormModel(registerState).submitDisabled,
    );
  });
});
