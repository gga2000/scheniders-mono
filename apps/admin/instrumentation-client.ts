// Same lazy load as the platform app: the SDK arrives in its own chunk after
// the first paint instead of on every route's first load.
void Promise.all([import("@sentry/nextjs"), import("@scheniders/shared/sentry-scrub")]).then(
  ([Sentry, { baseSentryOptions }]) => {
    Sentry.init({
      ...baseSentryOptions({
        app: "admin",
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
        tracesSampleRate: 0.2,
      }),
    });
  },
);
