import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@scheniders/shared/sentry-scrub";
import { dropSessionGone } from "@/lib/session-gone";

const base = baseSentryOptions({
  app: "admin",
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  vercelEnv: process.env.VERCEL_ENV,
  tracesSampleRate: 0.2,
});

Sentry.init({
  ...base,
  // A refused refresh of an ended session is "signed out", not a fault.
  beforeSend: dropSessionGone<Sentry.ErrorEvent>(base.beforeSend),
  // Server code reports most failures with console.error and a handled
  // response rather than a throw; this makes each one a Sentry event.
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});
