// The browser half of Sentry. Nothing imports it statically: the console
// loads it after the page has loaded (instrumentation-client.ts), or sooner
// when a screen catches an error (report-error.ts), whichever comes first.
// Importing the two names it uses, not the whole SDK, lets the bundle drop
// what this console never turns on, such as session replay and the
// feedback widget.
import { captureException, init } from "@sentry/nextjs";
import { baseSentryOptions } from "@scheniders/shared/sentry-scrub";

init(
  baseSentryOptions({
    app: "admin",
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
    tracesSampleRate: 0.2,
  }),
);

export { captureException };
