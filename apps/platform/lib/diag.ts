// ---------------------------------------------------------------------------
// Diagnostic Logger
// No-op in production builds. Next.js replaces process.env.NODE_ENV at build
// time, so the ternary is resolved statically and the dead branch is removed
// by the minifier — zero runtime cost in production.
// ---------------------------------------------------------------------------

const noop = (): void => {};

export const diag = process.env.NODE_ENV === 'development'
  ? { log: console.log, warn: console.warn, error: console.error }
  : { log: noop as typeof console.log, warn: noop as typeof console.warn, error: noop as typeof console.error };
