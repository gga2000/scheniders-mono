// The browser SDK is imported after this module runs instead of statically:
// a static import puts ~76 KB (gzip) on every route's first load, and
// merchants are on mid-range Android over mobile data. Errors thrown before
// the SDK finishes loading are not reported; server and edge errors are
// unaffected (instrumentation.ts). Session Replay is left out for the same
// reason.
void Promise.all([import("@sentry/nextjs"), import("@scheniders/shared/sentry-scrub")]).then(
    ([Sentry, { baseSentryOptions }]) => {
        Sentry.init({
            ...baseSentryOptions({
                app: "platform",
                dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
                vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
                tracesSampleRate: 0.1,
            }),
        });
    },
);
