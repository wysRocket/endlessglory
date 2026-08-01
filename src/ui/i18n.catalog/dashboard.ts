// English source strings for the player dashboard entry (dashboard.html).
// Contributors add English only; the maintainer fills every locale at release.
// See docs/i18n-scaling/translation-workflow.md.
//
// Assembled into `en` by ./index.ts under the `dashboard` namespace. Like
// guide.ts and editor.ts this module carries NO per-locale blocks (no
// `as const`), so a new dashboard string is an English-only add that
// compiles; the translations live solely in the overlays.

export const dashboardStrings = {
  nav: {
    profile: 'Profile',
    collection: 'Collection',
    leaderboard: 'Leaderboard',
    logout: 'Log out',
  },
  login: {
    title: 'Sign in',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    registerPrompt: "Don't have an account?",
    registerLink: 'Create one',
    twoFactorLabel: '6-digit or recovery code',
    twoFactorSubmit: 'Verify',
  },
  register: {
    title: 'Create an account',
    email: 'Email',
    submit: 'Create account',
  },
  loggedOut: {
    message: 'Sign in to view your account.',
  },
  profile: {
    title: 'Profile',
    noCharacters: 'No characters yet.',
  },
  collection: {
    title: 'Collection',
    empty: 'No deeds earned yet.',
    loadMore: 'Load more',
  },
  leaderboard: {
    title: 'Leaderboard',
    tabXp: 'Experience',
    tabArena: 'Arena',
  },
  error: {
    retry: 'Retry',
    generic: 'Something went wrong.',
  },
};
