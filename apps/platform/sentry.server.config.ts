import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@scheniders/shared/sentry-scrub";

Sentry.init({
    ...baseSentryOptions({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        vercelEnv: process.env.VERCEL_ENV,
        tracesSampleRate: 0.2,
    }),
    // Crons, webhooks and server actions report many failures with
    // console.error and a handled 500 rather than a throw. This turns each of
    // those into a Sentry event, so a broken job is seen, not just logged.
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});
