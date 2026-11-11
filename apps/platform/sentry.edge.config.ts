import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@scheniders/shared/sentry-scrub";

Sentry.init({
    ...baseSentryOptions({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        vercelEnv: process.env.VERCEL_ENV,
        tracesSampleRate: 0.2,
    }),
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});
