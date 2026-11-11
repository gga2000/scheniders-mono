import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@scheniders/shared/sentry-scrub";

Sentry.init({
  ...baseSentryOptions({
    app: "storefront",
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    vercelEnv: process.env.VERCEL_ENV,
    tracesSampleRate: 0.05,
  }),
  // Server code reports most failures with console.error and a handled
  // response rather than a throw; this makes each one a Sentry event.
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});

// packages/sections reports dropped sections through `globalThis.Sentry`
// (it has no @sentry dependency of its own); see sections/src/_report.ts.
(globalThis as { Sentry?: Pick<typeof Sentry, "captureMessage"> }).Sentry = { captureMessage: Sentry.captureMessage };
