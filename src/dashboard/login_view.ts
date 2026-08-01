// Pure decision core for the dashboard login/register form: given the current
// form state, what should be shown. DOM-free and Node-tested directly; the DOM
// half lives in login_painter.ts. Follows the pure-core-plus-painter recipe in
// src/ui/unit_portrait.ts.

export interface LoginFormState {
  mode: 'login' | 'register';
  username: string;
  password: string;
  error: string | null;
  twoFactorRequired: boolean;
}

export interface LoginFormModel {
  mode: 'login' | 'register';
  showTwoFactorField: boolean;
  errorText: string | null;
  submitDisabled: boolean;
}

export function loginFormModel(state: LoginFormState): LoginFormModel {
  return {
    mode: state.mode,
    showTwoFactorField: state.twoFactorRequired,
    errorText: state.error,
    submitDisabled: state.username.length === 0 || state.password.length === 0,
  };
}
